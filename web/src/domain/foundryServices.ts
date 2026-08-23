import type { FoundryServiceConfig } from './types'

export interface FoundryServiceDefinition {
  id: string
  name: string
  type: 'Content Understanding' | 'Speech' | 'Translation' | 'Language'
  quantityUnit: string
  rateKey: string
}

export const FOUNDRY_SERVICES: FoundryServiceDefinition[] = [
  { id: 'content-layout', name: 'Content Understanding - Document Layout Analyzer', type: 'Content Understanding', quantityUnit: 'thousand pages', rateKey: 'service.contentUnderstanding.layout.pages1k' },
  { id: 'content-invoice', name: 'Content Understanding - Invoice Analyzer', type: 'Content Understanding', quantityUnit: 'thousand pages', rateKey: 'service.contentUnderstanding.invoice.pages1k' },
  { id: 'content-call-center', name: 'Content Understanding - Call Center Analyzer', type: 'Content Understanding', quantityUnit: 'audio hours', rateKey: 'service.contentUnderstanding.callCenter.audioHour' },
  { id: 'content-tax-us', name: 'Content Understanding - Tax (US) Analyzer', type: 'Content Understanding', quantityUnit: 'thousand pages', rateKey: 'service.contentUnderstanding.taxUs.pages1k' },
  { id: 'content-ocr-read', name: 'Content Understanding - OCR Read Analyzer', type: 'Content Understanding', quantityUnit: 'thousand pages', rateKey: 'service.contentUnderstanding.ocrRead.pages1k' },
  { id: 'content-document-fields', name: 'Content Understanding - Document Fields Analyzer', type: 'Content Understanding', quantityUnit: 'thousand pages', rateKey: 'service.contentUnderstanding.documentFields.pages1k' },
  { id: 'speech-voice-live', name: 'Azure Speech - Voice Live', type: 'Speech', quantityUnit: 'audio hours', rateKey: 'service.speech.voiceLive.audioHour' },
  { id: 'speech-to-text', name: 'Azure Speech - Speech to Text', type: 'Speech', quantityUnit: 'audio hours', rateKey: 'service.speech.speechToText.audioHour' },
  { id: 'text-to-speech', name: 'Azure Speech - Text to Speech', type: 'Speech', quantityUnit: 'million characters', rateKey: 'service.speech.textToSpeech.characters1m' },
  { id: 'text-to-speech-avatar', name: 'Azure Speech - Text to Speech Avatar', type: 'Speech', quantityUnit: 'minutes', rateKey: 'service.speech.avatar.minute' },
  { id: 'speech-translation', name: 'Azure Speech - Speech Translation', type: 'Speech', quantityUnit: 'audio hours', rateKey: 'service.speech.translation.audioHour' },
  { id: 'translator-text', name: 'Azure Translator - Text Translation', type: 'Translation', quantityUnit: 'million characters', rateKey: 'service.translator.text.characters1m' },
  { id: 'translator-document', name: 'Azure Translator - Document Translation', type: 'Translation', quantityUnit: 'million characters', rateKey: 'service.translator.document.characters1m' },
  { id: 'language-detection', name: 'Azure Language - Language Detection', type: 'Language', quantityUnit: 'thousand text records', rateKey: 'service.language.detection.records1k' },
  { id: 'language-text-pii', name: 'Azure Language - Text PII Redaction', type: 'Language', quantityUnit: 'thousand text records', rateKey: 'service.language.textPii.records1k' },
  { id: 'language-document-pii', name: 'Azure Language - Document PII Redaction', type: 'Language', quantityUnit: 'thousand pages', rateKey: 'service.language.documentPii.pages1k' },
  { id: 'language-health', name: 'Azure Language - Text Analytics for Health', type: 'Language', quantityUnit: 'thousand text records', rateKey: 'service.language.health.records1k' },
  { id: 'language-conversation-pii', name: 'Azure Language - Conversational PII Redaction', type: 'Language', quantityUnit: 'thousand text records', rateKey: 'service.language.conversationPii.records1k' },
]

export function createFoundryServiceSelections(): FoundryServiceConfig[] {
  return FOUNDRY_SERVICES.map((service) => ({
    id: service.id,
    enabled: false,
    monthlyQuantity: 1,
    customUnitRateCad: null,
  }))
}

export function getFoundryService(serviceId: string) {
  return FOUNDRY_SERVICES.find((service) => service.id === serviceId)
}

export const FOUNDRY_SERVICES_AS_OF = '2026-08-20'