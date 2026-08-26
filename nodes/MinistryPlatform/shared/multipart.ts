import { randomBytes } from 'node:crypto';

/** One part of a multipart/form-data body. */
export interface MultipartPart {
	/** Form field name, e.g. 'file-0'. */
	name: string;
	/**
	 * Original filename. Callers should always provide one for file parts:
	 * ASP.NET treats a part without a filename attribute as a plain form
	 * field, so MP would see no file at all.
	 */
	filename?: string;
	/** MIME type for the part; invalid values fall back to application/octet-stream. */
	contentType?: string;
	/** Raw part payload. */
	data: Buffer;
}

const CRLF = '\r\n';

/** Matches a plausible type/subtype MIME string (printable ASCII, no CR/LF). */
const CONTENT_TYPE_PATTERN = /^[!-~]+\/[!-~]+(?:;[ -~]*)?$/;

/**
 * Escape a Content-Disposition attribute value the way WHATWG
 * multipart/form-data serialization does: `"` → %22, CR → %0D, LF → %0A.
 * Filenames come from workflow-controlled binary metadata, so this doubles
 * as a header-injection guard.
 */
function escapeAttribute(value: string): string {
	return value.replace(/"/g, '%22').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/**
 * Generate an RFC 2046-safe boundary: 128 bits of entropy as hex plus a
 * recognizable prefix (53 chars total, under the 70-char limit, drawn
 * entirely from the allowed boundary character set).
 */
function generateBoundary(): string {
	return `----n8nMpFormBoundary${randomBytes(16).toString('hex')}`;
}

/**
 * Encode parts into a complete multipart/form-data body with RFC 2046 framing
 * (CRLF line endings, closing --boundary-- delimiter, no preamble/epilogue).
 * Hand-rolled because the community-nodes import allowlist bans the form-data
 * package. Pure function over Buffers: payloads pass through byte-for-byte,
 * and the result replays safely on the transport's expired-token retry.
 */
export function encodeMultipart(parts: MultipartPart[]): { body: Buffer; contentType: string } {
	const boundary = generateBoundary();
	const chunks: Buffer[] = [];

	for (const part of parts) {
		let headers = `--${boundary}${CRLF}`;
		headers += `Content-Disposition: form-data; name="${escapeAttribute(part.name)}"`;
		if (part.filename !== undefined) {
			headers += `; filename="${escapeAttribute(part.filename)}"`;
		}
		headers += CRLF;
		if (part.contentType !== undefined) {
			const contentType = CONTENT_TYPE_PATTERN.test(part.contentType)
				? part.contentType
				: 'application/octet-stream';
			headers += `Content-Type: ${contentType}${CRLF}`;
		}
		headers += CRLF;

		chunks.push(Buffer.from(headers, 'utf8'), part.data, Buffer.from(CRLF, 'utf8'));
	}

	chunks.push(Buffer.from(`--${boundary}--${CRLF}`, 'utf8'));

	return {
		body: Buffer.concat(chunks),
		contentType: `multipart/form-data; boundary=${boundary}`,
	};
}
