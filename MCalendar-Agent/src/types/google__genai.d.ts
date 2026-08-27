declare module '@google/genai' {
  export interface GenerateContentConfig {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
    tools?: any[];
    toolConfig?: any;
    systemInstruction?: string | any;
  }
  
  export interface GenerateContentConfigSchema {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
    tools?: any[];
    toolConfig?: any;
    systemInstruction?: string | any;
  }
  
  export interface FunctionCallingConfig {
    mode?: "AUTO" | "ANY" | "NONE";
    allowedFunctionNames?: string[];
  }
  
  export interface GenerateContentResponse {
    response: {
      text(): string;
      candidates?: any[];
    };
    candidates?: any[];
  }
  
  export interface Part {
    text?: string;
    functionCall?: {
      name: string;
      args: Record<string, any>;
    };
    functionResponse?: {
      name: string;
      response: Record<string, any>;
    };
  }
  
  export interface Content {
    role: "user" | "model";
    parts: Part[];
  }
  
  export interface GenerateContentCandidate {
    content: Content;
    finishReason?: string;
    index?: number;
  }
  
  export class GoogleGenAI {
    constructor(options: { apiKey: string; vertexai?: boolean; project?: string; location?: string });
    getGenerativeModel(modelName: string, options?: { systemInstruction?: string | any }): GenerativeModel;
    models: {
      list(): AsyncIterableIterator<{ name: string }>;
      generateContent(model: string, contents: any[], config?: GenerateContentConfig): Promise<any>;
    };
  }
  
  export class GenerativeModel {
    modelName: string;
    generateContent(contents: any[], config?: GenerateContentConfig): Promise<any>;
    generateContentStream(contents: any[], config?: GenerateContentConfig): AsyncIterable<any>;
  }
  
  export type FunctionCallingConfigMode = "AUTO" | "ANY" | "NONE";
  
  export interface Model {
    name: string;
    displayName?: string;
    description?: string;
    inputTokenLimit?: number;
    outputTokenLimit?: number;
    supportedGenerationMethods?: string[];
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
  }
  
  export interface Models {
    list(): AsyncIterableIterator<Model>;
  }
}