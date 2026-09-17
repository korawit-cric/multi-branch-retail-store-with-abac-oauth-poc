import { Module } from '@nestjs/common';
import { RetailController } from './retail.controller';
import { RetailService } from './retail.service';
@Module({ controllers: [RetailController], providers: [RetailService] })
export class RetailModule {}
