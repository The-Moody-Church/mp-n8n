import type { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
import { mpApiRequest } from '../shared/transport';

/**
 * Fetch column names for the selected table by retrieving a single record.
 * If the table is empty, the dropdown will be empty — use Manual mode instead.
 */
export async function getTableFields(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const tableName = this.getNodeParameter('tableName', 0) as
		| { value: string }
		| string;
	const table = typeof tableName === 'string' ? tableName : tableName.value;

	if (!table || /[/\\]|\.\./.test(table)) {
		return { results: [] };
	}

	const response = (await mpApiRequest.call(this, 'GET', `/tables/${table}`, {
		$top: 1,
	})) as unknown;

	if (!Array.isArray(response) || response.length === 0) {
		return { results: [] };
	}

	const record = response[0] as Record<string, unknown>;

	let results = Object.keys(record).map((fieldName) => ({
		name: fieldName,
		value: fieldName,
	}));

	if (filter) {
		const lowerFilter = filter.toLowerCase();
		results = results.filter((r) => r.name.toLowerCase().includes(lowerFilter));
	}

	results.sort((a, b) => a.name.localeCompare(b.name));

	return { results };
}
