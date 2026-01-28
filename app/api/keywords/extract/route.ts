import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';

interface Review {
  title: string;
  content: string;
}

// Common stop words to filter out
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'shall', 'can', 'need', 'dare', 'ought', 'used', 'it', 'its', "it's", 'this', 'that',
  'these', 'those', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you',
  'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her',
  'hers', 'herself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which',
  'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then', 'once',
  'app', 'apps', 'really', 'very', 'much', 'many', 'get', 'got', 'getting', 'use', 'used',
  'using', 'like', 'likes', 'liked', 'dont', "don't", 'doesnt', "doesn't", 'didnt', "didn't",
  'cant', "can't", 'wont', "won't", 'ive', "i've", 'im', "i'm", 'its', 'thats', "that's",
  'whats', "what's", 'heres', "here's", 'theres', "there's", 'youre', "you're", 'theyre',
  "they're", 'weve', "we've", 'youve', "you've", 'theyve', "they've", 'hadnt', "hadn't",
  'hasnt', "hasn't", 'havent', "haven't", 'isnt', "isn't", 'arent', "aren't", 'wasnt',
  "wasn't", 'werent', "weren't", 'being', 'having', 'doing', 'would', 'could', 'should',
  'might', 'must', 'shall', 'will', 'going', 'gone', 'went', 'come', 'came', 'coming',
  'make', 'made', 'making', 'take', 'took', 'taking', 'give', 'gave', 'giving', 'think',
  'thought', 'thinking', 'say', 'said', 'saying', 'see', 'saw', 'seeing', 'want', 'wanted',
  'wanting', 'look', 'looked', 'looking', 'find', 'found', 'finding', 'know', 'knew',
  'knowing', 'feel', 'felt', 'feeling', 'try', 'tried', 'trying', 'leave', 'left', 'leaving',
  'put', 'puts', 'putting', 'keep', 'kept', 'keeping', 'let', 'lets', 'letting', 'begin',
  'began', 'beginning', 'seem', 'seemed', 'seeming', 'help', 'helped', 'helping', 'show',
  'showed', 'showing', 'hear', 'heard', 'hearing', 'play', 'played', 'playing', 'run',
  'ran', 'running', 'move', 'moved', 'moving', 'live', 'lived', 'living', 'believe',
  'believed', 'believing', 'hold', 'held', 'holding', 'bring', 'brought', 'bringing',
  'happen', 'happened', 'happening', 'write', 'wrote', 'writing', 'provide', 'provided',
  'providing', 'sit', 'sat', 'sitting', 'stand', 'stood', 'standing', 'lose', 'lost',
  'losing', 'pay', 'paid', 'paying', 'meet', 'met', 'meeting', 'include', 'included',
  'including', 'continue', 'continued', 'continuing', 'set', 'setting', 'learn', 'learned',
  'learning', 'change', 'changed', 'changing', 'lead', 'led', 'leading', 'understand',
  'understood', 'understanding', 'watch', 'watched', 'watching', 'follow', 'followed',
  'following', 'stop', 'stopped', 'stopping', 'create', 'created', 'creating', 'speak',
  'spoke', 'speaking', 'read', 'reading', 'allow', 'allowed', 'allowing', 'add', 'added',
  'adding', 'spend', 'spent', 'spending', 'grow', 'grew', 'growing', 'open', 'opened',
  'opening', 'walk', 'walked', 'walking', 'win', 'won', 'winning', 'offer', 'offered',
  'offering', 'remember', 'remembered', 'remembering', 'love', 'loved', 'loving', 'consider',
  'considered', 'considering', 'appear', 'appeared', 'appearing', 'buy', 'bought', 'buying',
  'wait', 'waited', 'waiting', 'serve', 'served', 'serving', 'die', 'died', 'dying', 'send',
  'sent', 'sending', 'expect', 'expected', 'expecting', 'build', 'built', 'building', 'stay',
  'stayed', 'staying', 'fall', 'fell', 'falling', 'cut', 'cutting', 'reach', 'reached',
  'reaching', 'kill', 'killed', 'killing', 'remain', 'remained', 'remaining', 'suggest',
  'suggested', 'suggesting', 'raise', 'raised', 'raising', 'pass', 'passed', 'passing',
  'sell', 'sold', 'selling', 'require', 'required', 'requiring', 'report', 'reported',
  'reporting', 'decide', 'decided', 'deciding', 'pull', 'pulled', 'pulling', 'even', 'still',
  'back', 'well', 'way', 'because', 'since', 'until', 'while', 'although', 'though', 'after',
  'before', 'when', 'if', 'about', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'between', 'under', 'again', 'further', 'then', 'once', 'any', 'both', 'each',
  'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same', 'than', 'too',
  'very', 'just', 'first', 'last', 'long', 'great', 'little', 'own', 'other', 'old', 'right',
  'big', 'high', 'different', 'small', 'large', 'next', 'early', 'young', 'important', 'few',
  'public', 'bad', 'same', 'able', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'year', 'years', 'day', 'days', 'time', 'times', 'week', 'weeks',
  'month', 'months', 'thing', 'things', 'lot', 'lots', 'bit', 'way', 'ways', 'point', 'points',
  'actually', 'probably', 'maybe', 'always', 'never', 'sometimes', 'often', 'usually',
  'already', 'still', 'yet', 'soon', 'later', 'today', 'yesterday', 'tomorrow', 'ago',
  'please', 'thank', 'thanks', 'sorry', 'okay', 'ok', 'yes', 'no', 'yeah', 'nope', 'sure',
  'definitely', 'absolutely', 'certainly', 'obviously', 'basically', 'simply', 'literally',
  'honestly', 'seriously', 'clearly', 'extremely', 'highly', 'totally', 'completely', 'fully',
  'entire', 'entirely', 'whole', 'especially', 'particularly', 'specifically', 'generally',
  'usually', 'normally', 'recently', 'currently', 'finally', 'eventually', 'immediately',
  'suddenly', 'quickly', 'slowly', 'easily', 'hard', 'however', 'therefore', 'thus', 'hence',
  'anyway', 'besides', 'instead', 'otherwise', 'meanwhile', 'nonetheless', 'nevertheless',
  'furthermore', 'moreover', 'star', 'stars', 'review', 'reviews', 'rating', 'ratings',
  'update', 'updates', 'updated', 'version', 'versions', 'download', 'downloads', 'downloaded',
  'install', 'installs', 'installed', 'uninstall', 'delete', 'deleted', 'remove', 'removed',
]);

// Extract meaningful keywords from text
function extractKeywords(text: string): Map<string, number> {
  const keywords = new Map<string, number>();

  // Normalize text
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Split into words
  const words = normalized.split(' ');

  // Count single words (unigrams)
  for (const word of words) {
    if (word.length >= 3 && word.length <= 20 && !STOP_WORDS.has(word) && !/^\d+$/.test(word)) {
      keywords.set(word, (keywords.get(word) || 0) + 1);
    }
  }

  // Extract bigrams (two-word phrases)
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i];
    const w2 = words[i + 1];
    if (
      w1.length >= 2 &&
      w2.length >= 2 &&
      !STOP_WORDS.has(w1) &&
      !STOP_WORDS.has(w2) &&
      !/^\d+$/.test(w1) &&
      !/^\d+$/.test(w2)
    ) {
      const bigram = `${w1} ${w2}`;
      keywords.set(bigram, (keywords.get(bigram) || 0) + 1);
    }
  }

  return keywords;
}

// POST /api/keywords/extract - Extract keywords from reviews
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { reviews, appName, appDescription } = body as {
      reviews: Review[];
      appName?: string;
      appDescription?: string;
    };

    if (!reviews || !Array.isArray(reviews)) {
      return NextResponse.json(
        { error: 'reviews array is required' },
        { status: 400 }
      );
    }

    // Combine all review text
    const allText = reviews
      .map((r) => `${r.title || ''} ${r.content || ''}`)
      .join(' ');

    // Add app name and description if provided
    const fullText = `${appName || ''} ${appDescription || ''} ${allText}`;

    // Extract keywords
    const keywordCounts = extractKeywords(fullText);

    // Sort by frequency and take top keywords
    const sortedKeywords = Array.from(keywordCounts.entries())
      .filter(([, count]) => count >= 2) // At least 2 occurrences
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100);

    // Categorize keywords
    const singleWords = sortedKeywords
      .filter(([keyword]) => !keyword.includes(' '))
      .slice(0, 50)
      .map(([keyword, count]) => ({ keyword, count }));

    const phrases = sortedKeywords
      .filter(([keyword]) => keyword.includes(' '))
      .slice(0, 30)
      .map(([keyword, count]) => ({ keyword, count }));

    return NextResponse.json({
      totalReviews: reviews.length,
      singleWords,
      phrases,
      allKeywords: sortedKeywords.slice(0, 50).map(([keyword, count]) => ({
        keyword,
        count,
        type: keyword.includes(' ') ? 'phrase' : 'word',
      })),
    });
  } catch (error) {
    console.error('Error extracting keywords:', error);
    return NextResponse.json(
      { error: 'Failed to extract keywords' },
      { status: 500 }
    );
  }
}
