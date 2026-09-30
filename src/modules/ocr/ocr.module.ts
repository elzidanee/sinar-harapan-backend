import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { OcrController } from './ocr.controller.js';
import { OcrService } from './ocr.service.js';

@Module({
  imports: [HttpModule, StorageModule],
  controllers: [OcrController],
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
