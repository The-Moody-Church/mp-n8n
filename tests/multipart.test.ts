/* eslint-disable @n8n/community-nodes/no-restricted-imports --
 * vitest is a dev-only dependency; the community-nodes import allowlist is
 * meant for shipped node code, and this test file is never published.
 */
import { describe, expect, it } from 'vitest';

import { encodeMultipart } from '../nodes/MinistryPlatform/shared/multipart';

const boundaryOf = (contentType: string): string =>
	contentType.replace('multipart/form-data; boundary=', '');

const textPart = {
	name: 'file-0',
	filename: 'a.txt',
	contentType: 'text/plain',
	data: Buffer.from('hello'),
};

describe('encodeMultipart', () => {
	it('generates a unique boundary per invocation', () => {
		const first = encodeMultipart([textPart]);
		const second = encodeMultipart([textPart]);
		const b1 = boundaryOf(first.contentType);
		const b2 = boundaryOf(second.contentType);
		expect(b1).not.toBe(b2);
		expect(b1).toMatch(/^----n8nMpFormBoundary[0-9a-f]{32}$/);
		expect(first.body.toString('utf8')).toContain(`--${b1}`);
	});

	it('frames a part with CRLF line endings per RFC 2046', () => {
		const { body, contentType } = encodeMultipart([textPart]);
		const b = boundaryOf(contentType);
		expect(body.toString('utf8')).toBe(
			`--${b}\r\n` +
				'Content-Disposition: form-data; name="file-0"; filename="a.txt"\r\n' +
				'Content-Type: text/plain\r\n' +
				'\r\n' +
				'hello\r\n' +
				`--${b}--\r\n`,
		);
	});

	it('writes content-disposition with both name and filename attributes', () => {
		const { body } = encodeMultipart([{ ...textPart, filename: 'photo.jpg' }]);
		expect(body.toString('utf8')).toContain(
			'Content-Disposition: form-data; name="file-0"; filename="photo.jpg"',
		);
	});

	it('omits the filename attribute when none is given', () => {
		const { body } = encodeMultipart([{ name: 'note', data: Buffer.from('x') }]);
		const text = body.toString('utf8');
		expect(text).toContain('Content-Disposition: form-data; name="note"\r\n');
		expect(text).not.toContain('filename=');
	});

	it('escapes quotes and newlines in the filename', () => {
		const { body } = encodeMultipart([{ ...textPart, filename: 'we"ird\r\nname.txt' }]);
		expect(body.toString('utf8')).toContain('filename="we%22ird%0D%0Aname.txt"');
	});

	it('names parts file-0 and file-1 across multiple binaries', () => {
		const { body } = encodeMultipart([
			textPart,
			{ ...textPart, name: 'file-1', filename: 'b.txt' },
		]);
		const text = body.toString('utf8');
		expect(text.indexOf('name="file-0"')).toBeGreaterThan(-1);
		expect(text.indexOf('name="file-0"')).toBeLessThan(text.indexOf('name="file-1"'));
		expect(text.match(/name="file-0"/g)).toHaveLength(1);
		expect(text.match(/name="file-1"/g)).toHaveLength(1);
	});

	it('passes binary payloads through byte for byte', () => {
		const data = Buffer.from([0x00, 0xff, 0x89, 0x50, 0x0d, 0x0a, 0x1a]);
		const { body, contentType } = encodeMultipart([{ ...textPart, data }]);
		const b = boundaryOf(contentType);
		const start = body.indexOf(Buffer.from('\r\n\r\n')) + 4;
		const end = body.length - Buffer.byteLength(`\r\n--${b}--\r\n`);
		expect(body.subarray(start, end).equals(data)).toBe(true);
	});

	it('terminates the body with the closing boundary delimiter', () => {
		const { body, contentType } = encodeMultipart([textPart, { ...textPart, name: 'file-1' }]);
		const closing = `--${boundaryOf(contentType)}--\r\n`;
		expect(body.subarray(body.length - Buffer.byteLength(closing)).toString('utf8')).toBe(closing);
	});

	it('falls back to application/octet-stream for an invalid part content type', () => {
		const { body } = encodeMultipart([{ ...textPart, contentType: 'text/plain\r\nX-Evil: 1' }]);
		const text = body.toString('utf8');
		expect(text).toContain('Content-Type: application/octet-stream\r\n');
		expect(text).not.toContain('X-Evil');
	});
});
