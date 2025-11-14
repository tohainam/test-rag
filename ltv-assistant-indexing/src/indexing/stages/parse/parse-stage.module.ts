/**
 * Parse Stage Module
 * Wires up all Parse Stage dependencies
 */

import { Module } from '@nestjs/common';
import { ParseStage } from './parse.stage';
import { ParserFactory } from './parsers/parser.factory';
import { PdfParser } from './parsers/pdf.parser';
import { DocxParser } from './parsers/docx.parser';
import { TextParser } from './parsers/text.parser';
import { CodeParser } from './parsers/code.parser';
import { ContentNormalizerService } from './services/content-normalizer.service';
import { MetadataEnricherService } from './services/metadata-enricher.service';

@Module({
  providers: [
    // Main orchestrator
    ParseStage,

    // Parser factory
    ParserFactory,

    // Individual parsers
    PdfParser,
    DocxParser,
    TextParser,
    CodeParser,

    // Services
    ContentNormalizerService,
    MetadataEnricherService,
  ],
  exports: [ParseStage],
})
export class ParseStageModule {}
