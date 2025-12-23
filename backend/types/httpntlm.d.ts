declare module 'httpntlm' {
  interface HttpNtlmOptions {
    url: string;
    username: string;
    password: string;
    workstation?: string;
    domain?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }

  interface HttpNtlmResponse {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  }

  function post(options: HttpNtlmOptions, callback: (err: any, res: HttpNtlmResponse) => void): void;
  function get(options: HttpNtlmOptions, callback: (err: any, res: HttpNtlmResponse) => void): void;
  
  export = { post, get };
}

