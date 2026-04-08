import type { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
import { mpApiRequest } from '../shared/transport';

interface TableMeta {
	Name: string;
	Display_Name?: string;
}

export async function getTables(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const response = (await mpApiRequest.call(this, 'GET', '/tables')) as TableMeta[];

	let results = response.map((table) => ({
		name: table.Display_Name ?? table.Name,
		value: table.Name,
	}));

	if (filter) {
		const lowerFilter = filter.toLowerCase();
		results = results.filter(
			(r) => r.name.toLowerCase().includes(lowerFilter) || r.value.toLowerCase().includes(lowerFilter),
		);
	}

	results.sort((a, b) => a.name.localeCompare(b.name));

	return { results };
}
