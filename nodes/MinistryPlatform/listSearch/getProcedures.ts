import type { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
import { mpApiRequest } from '../shared/transport';

interface ProcMeta {
	Name: string;
	Display_Name?: string;
}

export async function getProcedures(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const response = (await mpApiRequest.call(this, 'GET', '/procs')) as ProcMeta[];

	let results = response.map((proc) => ({
		name: proc.Display_Name ?? proc.Name,
		value: proc.Name,
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
