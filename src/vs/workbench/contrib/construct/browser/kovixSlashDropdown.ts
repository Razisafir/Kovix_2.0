// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See KOVIX_LICENSE.txt.
/*---------------------------------------------------------------------------------------------
 *  Kovix Slash Command Dropdown — autocomplete widget for the agent input.
 *
 *  When the user types "/" at the start of the input (or after a space), a
 *  dropdown appears above the input listing all available slash commands.
 *  The list filters as the user types, navigates with arrow keys, and
 *  selects with Enter / Tab / click.
 *
 *  This closes the "slash commands are invisible" gap — previously users
 *  had to read the README to learn that /skills, /memory, /swarm, /idea,
 *  /autonomous, /forget-everything existed, then type them perfectly with
 *  no visual feedback.
 *
 *  Architecture:
 *    - KovixSlashDropdown is a self-contained class that takes a textarea
 *      and a callback. It owns its own DOM, CSS, keyboard handling, and
 *      lifecycle.
 *    - The parent (ConstructAgentViewPane) instantiates one dropdown per
 *      input box, hooks its oninput + onkeydown, and disposes it when the
 *      view is destroyed.
 *    - All styling lives in kovixAgent.css under the .kovix-slash-dropdown
 *      selector (added by this commit).
 *
 *  Slash commands supported (mirrors handleSlashCommand in constructAgentView.ts):
 *    /skills                 — list all installed skills
 *    /<slug>                 — invoke a named skill (handled inline, no dropdown)
 *    /skill-create           — create a skill from the current document
 *    /forget-everything      — wipe all stored memories (with confirm)
 *    /memory                 — show current memory privacy posture
 *    /swarm                  — open the swarm spawner
 *    /idea <description>     — kick off the autonomous idea→app wizard
 *    /autonomous             — alias for /idea (start autonomous build)
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';

/** A single slash command shown in the dropdown. */
export interface IKovixSlashCommand {
	/** The full command string, including the leading slash. */
	command: string;
	/** Short human-readable description shown next to the command. */
	description: string;
	/** Optional usage hint, e.g. "<description>" for /idea. */
	usage?: string;
}

/** The static catalog of slash commands. Kept in sync with handleSlashCommand. */
export const KOVIX_SLASH_COMMANDS: readonly IKovixSlashCommand[] = [
	{ command: '/skills',             description: 'List all installed skills' },
	{ command: '/skill-create',       description: 'Create a skill from the current document' },
	{ command: '/memory',             description: 'Show current memory privacy posture' },
	{ command: '/swarm',              description: 'Open the swarm spawner' },
	{ command: '/idea',               description: 'Kick off the autonomous idea → app wizard', usage: '<description>' },
	{ command: '/autonomous',         description: 'Start autonomous build (alias for /idea)' },
	{ command: '/forget-everything',  description: 'Wipe all stored memories (with confirmation)' },
];

/** Callback invoked when the user selects a command from the dropdown. */
export type KovixSlashSelectFn = (command: IKovixSlashCommand) => void;

/**
 * Renders and manages a slash-command autocomplete dropdown attached to a
 * textarea. The dropdown is positioned absolutely above the input, filters
 * in real-time as the user types, and supports keyboard navigation.
 */
export class KovixSlashDropdown extends Disposable {
	private dropdown: HTMLDivElement | undefined;
	private items: HTMLDivElement[] = [];
	private filtered: IKovixSlashCommand[] = [];
	private activeIndex = 0;
	private isVisible = false;

	constructor(
		private readonly textarea: HTMLTextAreaElement,
		private readonly onSelect: KovixSlashSelectFn,
	) {
		super();

		// Hook input + keyboard events. We don't own the textarea (the parent
		// view does), so we just listen — we never replace the existing handlers.
		this._register({
			dispose: () => {
				this.textarea.removeEventListener('input', this.handleInput);
				this.textarea.removeEventListener('keydown', this.handleKeydown);
				this.textarea.removeEventListener('blur', this.handleBlur);
				this.hide();
			},
		});

		this.textarea.addEventListener('input', this.handleInput);
		this.textarea.addEventListener('keydown', this.handleKeydown);
		this.textarea.addEventListener('blur', this.handleBlur);
	}

	// ── Event handlers (bound as arrow functions to preserve `this`) ─────────

	private handleInput = (): void => {
		const value = this.textarea.value;
		// Show dropdown only when the textarea contains a single "/" or starts
		// with "/<partial-command>" with no spaces yet (the user is still typing
		// the command name).
		const match = /^\/(\w*)$/.exec(value);
		if (match) {
			this.show(match[1].toLowerCase());
		} else {
			this.hide();
		}
	};

	private handleKeydown = (e: KeyboardEvent): void => {
		if (!this.isVisible) { return; }

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				this.setActiveIndex((this.activeIndex + 1) % this.filtered.length);
				break;
			case 'ArrowUp':
				e.preventDefault();
				this.setActiveIndex((this.activeIndex - 1 + this.filtered.length) % this.filtered.length);
				break;
			case 'Enter':
			case 'Tab':
				if (this.filtered.length > 0) {
					e.preventDefault();
					this.select(this.filtered[this.activeIndex]);
				}
				break;
			case 'Escape':
				e.preventDefault();
				this.hide();
				break;
		}
	};

	private handleBlur = (): void => {
		// Defer hide so a click on an item still fires before the blur hides the dropdown.
		setTimeout(() => this.hide(), 150);
	};

	// ── Visibility ───────────────────────────────────────────────────────────

	private show(filter: string): void {
		this.filtered = KOVIX_SLASH_COMMANDS.filter(cmd =>
			cmd.command.toLowerCase().includes(filter) ||
			cmd.description.toLowerCase().includes(filter)
		);

		if (this.filtered.length === 0) {
			this.hide();
			return;
		}

		this.activeIndex = 0;

		if (!this.dropdown) {
			this.dropdown = document.createElement('div');
			this.dropdown.className = 'kovix-slash-dropdown';
			this.dropdown.setAttribute('role', 'listbox');
			this.dropdown.setAttribute('aria-label', 'Kovix slash commands');
		}

		// Re-render items
		this.dropdown.innerHTML = '';
		this.items = this.filtered.map((cmd, i) => {
			const item = document.createElement('div');
			item.className = 'kovix-slash-dropdown__item';
			item.setAttribute('role', 'option');
			item.dataset.index = String(i);

			const cmdEl = document.createElement('span');
			cmdEl.className = 'kovix-slash-dropdown__cmd';
			cmdEl.textContent = cmd.command;
			item.appendChild(cmdEl);

			if (cmd.usage) {
				const usageEl = document.createElement('span');
				usageEl.className = 'kovix-slash-dropdown__usage';
				usageEl.textContent = cmd.usage;
				item.appendChild(usageEl);
			}

			const descEl = document.createElement('span');
			descEl.className = 'kovix-slash-dropdown__desc';
			descEl.textContent = cmd.description;
			item.appendChild(descEl);

			item.addEventListener('mousedown', (e) => {
				e.preventDefault(); // don't blur the textarea
				this.select(cmd);
			});
			item.addEventListener('mouseenter', () => {
				this.setActiveIndex(i);
			});

			this.dropdown.appendChild(item);
			return item;
		});

		this.setActiveIndex(0);

		// Mount the dropdown ABOVE the textarea (so it doesn't cover the
		// user's typing). Position is relative to the textarea's parent.
		if (!this.dropdown.parentElement) {
			const parent = this.textarea.parentElement?.parentElement;
			if (parent) {
				parent.style.position = parent.style.position || 'relative';
				parent.appendChild(this.dropdown);
			}
		}

		this.dropdown.style.display = 'block';
		this.isVisible = true;
	}

	private hide(): void {
		if (this.dropdown) {
			this.dropdown.style.display = 'none';
		}
		this.isVisible = false;
	}

	private setActiveIndex(index: number): void {
		this.activeIndex = index;
		this.items.forEach((item, i) => {
			if (i === index) {
				item.classList.add('is-active');
				item.setAttribute('aria-selected', 'true');
				// Scroll into view if needed
				item.scrollIntoView({ block: 'nearest' });
			} else {
				item.classList.remove('is-active');
				item.removeAttribute('aria-selected');
			}
		});
	}

	private select(cmd: IKovixSlashCommand): void {
		// Replace the textarea content with the selected command + a trailing space.
		this.textarea.value = cmd.command + (cmd.usage ? ' ' : ' ');
		this.textarea.focus();
		// Place cursor at end
		const len = this.textarea.value.length;
		this.textarea.setSelectionRange(len, len);
		// Trigger input event so the parent's chip-scanner etc. see the new value
		this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
		this.hide();
		this.onSelect(cmd);
	}
}
