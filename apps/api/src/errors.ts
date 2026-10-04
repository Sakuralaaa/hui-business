import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { ZodError } from 'zod';
export function fail(code:string,message:string,status=400):never {throw new HttpException({code,message,recovery:'请检查字段、权限或刷新后重试'},status);}
@Catch()
export class Errors implements ExceptionFilter {
  catch(error:unknown,host:ArgumentsHost){
    const res=host.switchToHttp().getResponse();
    if(error instanceof ZodError)return res.status(400).json({code:'VALIDATION',message:'输入字段不正确',issues:error.issues});
    if(error instanceof HttpException)return res.status(error.getStatus()).json(error.getResponse());
    console.error('request failed',error instanceof Error?error.name:'unknown');
    return res.status(500).json({code:'INTERNAL',message:'处理失败；请查看关联任务或联系管理员',recovery:'刷新状态后重试'});
  }
}
