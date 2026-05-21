import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { InternalController } from './internal.controller';

@Module({
  imports: [EmailModule],
  controllers: [InternalController],
})
export class InternalModule {}
