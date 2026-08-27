declare module 'express' {
  export interface Request {
    body: any;
    params: any;
    query: any;
    headers: any;
    method: string;
    path: string;
    url: string;
  }
  
  export interface Response {
    status(code: number): this;
    json(body: any): this;
    send(body: any): this;
    setHeader(name: string, value: string): this;
    sendFile(path: string, options?: any, callback?: (err: Error) => void): void;
  }
  
  export interface NextFunction {
    (err?: any): void;
  }
  
  export interface Application {
    get(path: string, handler: (req: Request, res: Response, next: NextFunction) => void): this;
    post(path: string, handler: (req: Request, res: Response, next: NextFunction) => void): this;
    put(path: string, handler: (req: Request, res: Response, next: NextFunction) => void): this;
    delete(path: string, handler: (req: Request, res: Response, next: NextFunction) => void): this;
    use(path: string | ((req: Request, res: Response, next: NextFunction) => void), handler?: (req: Request, res: Response, next: NextFunction) => void): this;
    use(handler: ErrorRequestHandler): this;
    use(path: string, handler: ErrorRequestHandler): this;
    listen(port: number, host?: string, callback?: () => void): any;
    static(root: string, options?: { index?: string; maxAge?: number }): RequestHandler;
  }
  
  export interface RequestHandler {
    (req: Request, res: Response, next: NextFunction): void;
  }
  
  export interface ErrorRequestHandler {
    (err: Error, req: Request, res: Response, next: NextFunction): void;
  }
  
  export interface Express {
    (): Application;
    json(options?: { limit?: string }): RequestHandler;
    urlencoded(options: { extended: boolean }): RequestHandler;
    static(root: string, options?: { index?: string; maxAge?: number }): RequestHandler;
    Router: {
      (): Router;
    };
  }
  
  export var express: Express;
  
  export function json(): RequestHandler;
  export function urlencoded(options: { extended: boolean }): RequestHandler;
  export function static(root: string, options?: { index?: string; maxAge?: number }): RequestHandler;
  
  export const Router: {
    (): Router;
  };
  
  export interface Router {
    get(path: string, handler: RequestHandler): this;
    post(path: string, handler: RequestHandler): this;
    put(path: string, handler: RequestHandler): this;
    delete(path: string, handler: RequestHandler): this;
    use(path: string | RequestHandler, handler?: RequestHandler): this;
  }
  
  // Default export
  export = express;
}