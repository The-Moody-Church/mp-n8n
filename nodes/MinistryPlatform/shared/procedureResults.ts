// ── Stored procedure result shaping ──────────────────────────────────────────
//
// GET/POST /procs/{name} always returns an array of result sets —
// [[...rows of RS1], [...rows of RS2]] — even for single-result-set procs.
// Emitting that envelope directly would make each n8n item an entire result
// set instead of a row. These helpers unwrap the envelope and normalize
// parameter names.

import type { IDataObject } from 'n8n-workflow';

export type ResultSetHandling = 'firstResultSet' | 'allFlattened' | 'allGrouped';

/**
 * Normalize one result-set row into an object n8n can emit as item json.
 */
function toRowObject(row: unknown): IDataObject {
	if (row !== null && typeof row === 'object' && !Array.isArray(row)) {
		return row as IDataObject;
	}
	return { value: row } as IDataObject;
}

/**
 * Fallback for responses that aren't the result-set envelope (error bodies,
 * older MP versions) — mirrors the generic record handling used elsewhere.
 */
function fallbackRecords(response: unknown): IDataObject[] {
	if (response == null) {
		return [];
	}
	if (Array.isArray(response)) {
		return (response as unknown[]).map(toRowObject);
	}
	if (typeof response === 'object') {
		return [response as IDataObject];
	}
	return [{ value: response } as IDataObject];
}

/**
 * Shape a /procs response into n8n item json objects.
 *
 * - firstResultSet: one item per row of the first result set
 * - allFlattened: one item per row across all result sets, each annotated with
 *   _resultSetIndex (overwrites a same-named proc column if one exists)
 * - allGrouped: one item per result set: { resultSetIndex, rows }
 *
 * Responses that aren't an array of arrays fall back to being treated as a
 * plain record list instead of throwing.
 */
export function shapeProcResults(response: unknown, mode: ResultSetHandling): IDataObject[] {
	if (!Array.isArray(response) || !response.every((resultSet) => Array.isArray(resultSet))) {
		return fallbackRecords(response);
	}
	const resultSets = response as unknown[][];

	if (mode === 'allGrouped') {
		return resultSets.map((rows, resultSetIndex) => ({
			resultSetIndex,
			rows: rows.map(toRowObject),
		}));
	}
	if (mode === 'allFlattened') {
		return resultSets.flatMap((rows, resultSetIndex) =>
			rows.map((row) => ({ ...toRowObject(row), _resultSetIndex: resultSetIndex })),
		);
	}
	return (resultSets[0] ?? []).map(toRowObject);
}

/**
 * Ensure stored procedure parameter names carry the @ prefix MP requires.
 * An explicit '@Foo' key wins over a bare 'Foo' key of the same name.
 * Non-object input is returned unchanged.
 */
export function prefixProcParams(params: IDataObject): IDataObject {
	if (params === null || typeof params !== 'object' || Array.isArray(params)) {
		return params;
	}
	const result: IDataObject = {};
	for (const [key, value] of Object.entries(params)) {
		if (key.startsWith('@')) {
			result[key] = value;
		}
	}
	for (const [key, value] of Object.entries(params)) {
		if (!key.startsWith('@') && !(`@${key}` in result)) {
			result[`@${key}`] = value;
		}
	}
	return result;
}
