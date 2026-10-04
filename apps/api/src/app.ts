import { Module } from '@nestjs/common';
import { Db } from './db';
import { Storage } from './storage';
import { Intake } from './intake';
import { Imports } from './imports';
import { Business } from './business';
import { Analysis } from './analysis';
import { Models } from './models';
import { Assets } from './assets';
import { Operations } from './operations';
import { SessionGuard,GrantGuard } from './auth';
import { AuthController,IntakeController,AppController } from './controllers';
@Module({controllers:[AuthController,IntakeController,AppController],providers:[Db,Storage,Intake,Imports,Business,Analysis,Models,Assets,Operations,SessionGuard,GrantGuard]})
export class AppModule {}
