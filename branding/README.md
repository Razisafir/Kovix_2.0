# Kovix Branding Assets

Place the following files here before building a release:
- kovix.ico (Windows icon, 256x256)
- kovix.icns (macOS icon)
- kovix_512.png (Linux icon, 512x512)
- kovix_256.png (256x256 PNG)
- kovix_128.png (128x128 PNG)

These must replace the corresponding files in /resources/ before running the build pipeline.

## How to Replace Icons

After placing your icon files here, copy them to the appropriate locations:

### Windows
```bash
cp branding/kovix.ico resources/win32/kovix.ico
cp branding/kovix.ico resources/win32/code.ico
```

### macOS
```bash
cp branding/kovix.icns resources/darwin/kovix.icns
cp branding/kovix.icns resources/darwin/code.icns
```

### Linux
```bash
cp branding/kovix_512.png resources/linux/kovix.png
cp branding/kovix_512.png resources/linux/code.png
```

### Server (Web)
```bash
cp branding/kovix_512.png resources/server/kovix-512.png
cp branding/kovix_192.png resources/server/kovix-192.png
```

### Windows Tile Icons
```bash
cp branding/kovix_150x150.png resources/win32/kovix_150x150.png
cp branding/kovix_70x70.png resources/win32/kovix_70x70.png
```
