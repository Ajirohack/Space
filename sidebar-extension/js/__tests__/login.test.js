import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

// Load a minimal HTML structure containing the required elements.
const html = `
  <!DOCTYPE html>
  <html lang="en">
    <head><meta charset="UTF-8"><title>Login Test</title></head>
    <body>
      <input type="text" id="membership-key" />
      <button id="login-button">Login</button>
      <div id="key-error" style="display:none;"></div>
      <div id="status-message" style="display:none;"></div>
    </body>
  </html>
`;

describe('Login Component', () => {
    let dom, document, membershipKeyInput, loginButton, keyError, statusMessage;

    beforeEach(() => {
        // Setup jsdom with the provided HTML
        dom = new JSDOM(html, { url: "http://localhost" });
        document = dom.window.document;

        membershipKeyInput = document.getElementById('membership-key');
        loginButton = document.getElementById('login-button');
        keyError = document.getElementById('key-error');
        statusMessage = document.getElementById('status-message');

        // Expose globals required by login.js
        global.document = document;
        global.window = dom.window;

        // Stub chrome.runtime.sendMessage
        global.chrome = {
            runtime: {
                sendMessage: vi.fn(),
            },
        };

        // Simulate DOMContentLoaded event to trigger initialization in login.js (if needed)
        document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    });

    it('shows error if membership key is empty when login button is clicked', async () => {
        // Ensure input is empty
        membershipKeyInput.value = '';

        // Inject login.js into the document
        const loginScript = fs.readFileSync(
            path.resolve(__dirname, '../login.js'),
            'utf8'
        );
        const scriptEl = document.createElement('script');
        scriptEl.textContent = loginScript;
        document.body.appendChild(scriptEl);

        // Trigger click event on login button
        loginButton.click();

        // Check that key error is displayed with the proper message
        expect(keyError.textContent).toBe('Please enter your membership key.');
        expect(keyError.style.display).toBe('block');
    });

    it('calls chrome.runtime.sendMessage with AUTH_LOGIN when key is provided', async () => {
        const testKey = 'sample-key';
        membershipKeyInput.value = testKey;

        // Configure the chrome.runtime.sendMessage mock to resolve with a success response.
        global.chrome.runtime.sendMessage.mockResolvedValue({
            success: true,
            userName: 'TestUser',
        });

        // Inject login.js code into the document
        const loginScript = fs.readFileSync(
            path.resolve(__dirname, '../login.js'),
            'utf8'
        );
        const scriptEl = document.createElement('script');
        scriptEl.textContent = loginScript;
        document.body.appendChild(scriptEl);

        // Trigger click event on login button
        await loginButton.click();

        // Await asynchronous actions to complete
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Verify that chrome.runtime.sendMessage was called with expected arguments
        expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
            type: 'AUTH_LOGIN',
            payload: { key: testKey },
        });

        // Check that the success message is displayed
        expect(statusMessage.textContent).toContain('Login successful! Welcome, TestUser.');
    });

    // ...you can add more tests for other interactions if needed.
});
