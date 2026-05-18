import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { CrmController } from './crm.controller';
import { InternalController } from './internal.controller';
import { TwentyClient } from './twenty.client';

@Module({
  imports: [EmailModule],
  providers: [TwentyClient],
  controllers: [InternalController, CrmController],
})
export class InternalModule {}
