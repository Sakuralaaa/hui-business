export interface CollectionAdapter {name:string;capabilities:string[];collect(taskId:string):Promise<{files:string[];limitations:string[]}>}
export interface ChannelAdapter {name:string;capabilities:string[];read(id:string):Promise<unknown>;execute(approvedActionId:string):Promise<{status:string;readback:unknown}>}
export interface ModelProvider {name:string;chat(input:{model:string;system:string;user:string;maxTokens:number}):Promise<{text:string;inputTokens:number|null;outputTokens:number|null}>}
export interface ImageProvider {generate(input:{prompt:string;references:string[];model:string}):Promise<{jobId:string}>}
export interface StorageProvider {put(key:string,path:string):Promise<void>;local(key:string):Promise<string>;remove(key:string):Promise<void>}
export interface NotificationProvider {send(input:{recipient:string;subject:string;body:string}):Promise<void>}
