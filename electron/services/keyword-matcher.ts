import { listEnabledKeywords } from './db';
import type { Keyword } from '../../shared/types';
import { logger } from '../logger';

interface CompiledKeyword {
  keyword: Keyword;
  regex: RegExp;
}

let cache: CompiledKeyword[] | null = null;

function compile(kw: Keyword): CompiledKeyword | null {
  try {
    if (kw.is_regex) {
      return { keyword: kw, regex: new RegExp(kw.pattern, 'i') };
    }
    // Escape and wrap in word boundaries for literal patterns
    const escaped = kw.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { keyword: kw, regex: new RegExp(escaped, 'i') };
  } catch (e) {
    logger.warn('Invalid keyword pattern', { pattern: kw.pattern, error: String(e) });
    return null;
  }
}

export function invalidateKeywordCache() {
  cache = null;
}

function getCompiled(): CompiledKeyword[] {
  if (cache) return cache;
  cache = listEnabledKeywords()
    .map(compile)
    .filter((c): c is CompiledKeyword => c !== null);
  return cache;
}

export interface KeywordMatch {
  keyword: Keyword;
  matched: string;
}

export function findMatch(text: string): KeywordMatch | null {
  if (!text) return null;
  for (const ck of getCompiled()) {
    const m = text.match(ck.regex);
    if (m) return { keyword: ck.keyword, matched: m[0] };
  }
  return null;
}
