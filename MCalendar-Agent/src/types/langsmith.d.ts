declare module 'langsmith' {
  export class Client {
    constructor(options?: { apiKey?: string; apiUrl?: string });
    createRun(params: any): Promise<any>;
    updateRun(id: string, params: any): Promise<any>;
    listDatasets(options: any): AsyncIterable<any>;
    createDataset(name: string, options: { description?: string }): Promise<{ id: string; name: string; description?: string }>;
    createExamples(options: { datasetId: string; inputs: any[]; outputs: any[]; metadata?: any[] }): Promise<any>;
  }
}