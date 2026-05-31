use std::io::{Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// State held by the app for a single terminal session.
struct TerminalSession {
    stdin: Arc<Mutex<std::process::ChildStdin>>,
    child: Arc<Mutex<Child>>,
}

/// Managed state: one terminal session per app (extendable to multiple).
pub struct TerminalState {
    pub session: Arc<Mutex<Option<TerminalSession>>>,
}

impl TerminalState {
    pub fn new() -> Self {
        Self {
            session: Arc::new(Mutex::new(None)),
        }
    }
}

/// Spawn a new shell process and connect it to the frontend via Tauri events.
#[tauri::command]
pub async fn spawn_terminal(
    app: AppHandle,
    _cols: u16,
    _rows: u16,
) -> Result<String, String> {
    // Choose shell based on OS
    let shell = if cfg!(target_os = "windows") {
        "powershell"
    } else {
        // Try zsh first, fall back to bash, then sh
        if std::path::Path::new("/bin/zsh").exists() {
            "/bin/zsh"
        } else if std::path::Path::new("/bin/bash").exists() {
            "/bin/bash"
        } else {
            "/bin/sh"
        }
    };

    let mut child = Command::new(shell)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to get shell stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to get shell stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to get shell stderr".to_string())?;

    let stdin = Arc::new(Mutex::new(stdin));
    let child = Arc::new(Mutex::new(child));

    // Spawn blocking reader task for stdout
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || {
        let mut reader = stdout;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    let _ = app_clone.emit("terminal:data", "\r\n[Process exited]\r\n");
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit("terminal:data", data);
                }
                Err(e) => {
                    log::error!("Terminal stdout read error: {}", e);
                    break;
                }
            }
        }
    });

    // Spawn blocking reader task for stderr
    let app_clone2 = app.clone();
    tokio::task::spawn_blocking(move || {
        let mut reader = stderr;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone2.emit("terminal:data", data);
                }
                Err(e) => {
                    log::error!("Terminal stderr read error: {}", e);
                    break;
                }
            }
        }
    });

    // Store session
    let state = app.state::<TerminalState>();
    let mut session = state.session.lock().await;
    *session = Some(TerminalSession { stdin, child });

    Ok("terminal_spawned".to_string())
}

/// Send input from the frontend to the shell.
#[tauri::command]
pub async fn terminal_input(
    app: AppHandle,
    data: String,
) -> Result<(), String> {
    let state = app.state::<TerminalState>();
    let session_guard = state.session.lock().await;

    if let Some(session) = session_guard.as_ref() {
        let mut stdin = session.stdin.lock().await;
        stdin
            .write_all(data.as_bytes())
            .map_err(|e| format!("Write error: {}", e))?;
        stdin.flush().map_err(|e| format!("Flush error: {}", e))?;
    }

    Ok(())
}

/// Resize the terminal viewport.
/// Note: Without PTY, true resize is not supported. This is a no-op for now.
/// PTY support can be added in a future release for proper terminal resizing.
#[tauri::command]
pub async fn terminal_resize(
    _app: AppHandle,
    _cols: u16,
    _rows: u16,
) -> Result<(), String> {
    // Resize not supported without PTY — no-op for beta
    Ok(())
}

/// Kill the terminal session.
#[tauri::command]
pub async fn kill_terminal(app: AppHandle) -> Result<(), String> {
    let state = app.state::<TerminalState>();
    let mut session_guard = state.session.lock().await;

    if let Some(session) = session_guard.take() {
        let mut child = session.child.lock().await;
        let _ = child.kill();
        let _ = child.wait();
    }

    Ok(())
}
