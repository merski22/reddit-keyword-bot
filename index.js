const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

async function searchReddit(keyword) {
  const results = [];
  const keywordLower = keyword.toLowerCase();
  const keywordWords = keywordLower.split(' ');
  
  // Toronto subreddits
  const torontoSubs = ['toronto', 'askTO', 'torontoJobs', 'TorontoRealEstate', 'OntarioCanada'];
  
  try {
    // Search Toronto subs first
    for (const sub of torontoSubs) {
      try {
        const response = await axios.get(`https://www.reddit.com/r/${sub}/search.json`, {
          params: { q: keyword, restrict_sr: true, sort: 'relevance', limit: 25, t: 'all' },
          headers: { 'User-Agent': 'KeywordBot/1.0' }
        });
        
        const posts = response.data?.data?.children || [];
        for (const post of posts) {
          const title = post.data.title.toLowerCase();
          const text = (post.data.selftext || '').toLowerCase();
          const combined = title + ' ' + text;
          
          // STRICT: Must contain the main keyword or all words from keyword
          const hasKeyword = combined.includes(keywordLower) || 
                            keywordWords.every(word => combined.includes(word));
          
          if (hasKeyword) {
            results.push({
              title: post.data.title,
              subreddit: post.data.subreddit,
              score: post.data.score,
              comments: post.data.num_comments,
              url: `https://reddit.com${post.data.permalink}`,
              text: post.data.selftext?.substring(0, 500) || '',
              isToronto: true
            });
          }
        }
      } catch (e) {}
    }
    
    // Search general Reddit with keyword + toronto
    const response2 = await axios.get(`https://www.reddit.com/search.json`, {
      params: { q: `"${keyword}" toronto OR ontario OR canada`, sort: 'relevance', limit: 50, t: 'all' },
      headers: { 'User-Agent': 'KeywordBot/1.0' }
    });
    
    const posts2 = response2.data?.data?.children || [];
    for (const post of posts2) {
      const title = post.data.title.toLowerCase();
      const text = (post.data.selftext || '').toLowerCase();
      const combined = title + ' ' + text;
      
      const hasKeyword = combined.includes(keywordLower) || 
                        keywordWords.every(word => combined.includes(word));
      
      if (hasKeyword) {
        results.push({
          title: post.data.title,
          subreddit: post.data.subreddit,
          score: post.data.score,
          comments: post.data.num_comments,
          url: `https://reddit.com${post.data.permalink}`,
          text: post.data.selftext?.substring(0, 500) || '',
          isToronto: combined.includes('toronto') || combined.includes('gta') || combined.includes('ontario')
        });
      }
    }
    
    // Search general for pain points (broader)
    const response3 = await axios.get(`https://www.reddit.com/search.json`, {
      params: { q: `"${keyword}"`, sort: 'relevance', limit: 50, t: 'year' },
      headers: { 'User-Agent': 'KeywordBot/1.0' }
    });
    
    const posts3 = response3.data?.data?.children || [];
    for (const post of posts3) {
      const title = post.data.title.toLowerCase();
      const text = (post.data.selftext || '').toLowerCase();
      const combined = title + ' ' + text;
      
      const hasKeyword = combined.includes(keywordLower) || 
                        keywordWords.every(word => combined.includes(word));
      
      if (hasKeyword) {
        results.push({
          title: post.data.title,
          subreddit: post.data.subreddit,
          score: post.data.score,
          comments: post.data.num_comments,
          url: `https://reddit.com${post.data.permalink}`,
          text: post.data.selftext?.substring(0, 500) || '',
          isToronto: combined.includes('toronto') || combined.includes('gta') || combined.includes('ontario')
        });
      }
    }
    
  } catch (e) {
    console.error('Reddit search error:', e.message);
  }
  
  // Remove duplicates
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

function extractQuestions(results, keyword) {
  const keywordLower = keyword.toLowerCase();
  const questions = [];
  
  for (const post of results) {
    const title = post.title;
    const titleLower = title.toLowerCase();
    
    // Must be a question AND contain keyword
    const isQuestion = title.includes('?') || 
        /^(how|what|why|where|when|which|can i|should i|is it|does|do i|has anyone|anyone know|any tips|any advice|looking for|recommend|best)/i.test(title);
    
    if (isQuestion && titleLower.includes(keywordLower)) {
      questions.push(title);
    }
  }
  
  return [...new Set(questions)].slice(0, 10);
}

function extractPainPoints(results, keyword) {
  const keywordLower = keyword.toLowerCase();
  const painPhrases = [
    'frustrated', 'annoying', 'annoyed', 'hate', 'problem', 'issue', 'struggle',
    'difficult', 'hard to', "can't", "won't", 'expensive', 'terrible', 'awful',
    'worst', 'bad experience', 'disappointed', 'scared', 'afraid', 'worried',
    'stressed', 'anxiety', 'anxious', 'nervous', 'fear', 'help me', 'need help',
    'rip off', 'scam', 'overpriced', 'waste of money', 'never again', 'avoid',
    'horrible', 'nightmare', 'regret', 'mistake'
  ];
  
  const painPoints = [];
  
  for (const post of results) {
    const titleLower = post.title.toLowerCase();
    const text = (post.title + ' ' + post.text).toLowerCase();
    
    // Must contain keyword AND a pain phrase
    if (titleLower.includes(keywordLower) && painPhrases.some(phrase => text.includes(phrase))) {
      painPoints.push({
        title: post.title,
        snippet: post.text.substring(0, 150),
        subreddit: post.subreddit
      });
    }
  }
  
  return painPoints.slice(0, 8);
}

function extractRelatedKeywords(results, mainKeyword) {
  const wordCount = {};
  const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 
                     'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 
                     'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of', 
                     'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
                     'during', 'before', 'after', 'above', 'below', 'between', 'under', 
                     'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 
                     'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 
                     'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 
                     'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 
                     'this', 'that', 'these', 'those', 'i', 'me', 'my', 'myself', 'we', 'our', 
                     'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 
                     'them', 'their', 'what', 'which', 'who', 'whom', 'any', 'get', 'got', 
                     'about', 'also', 'like', 'know', 'think', 'want', 'going', 'really', 
                     'even', 'much', 'dont', 'ive', 'im', 'doesnt', 'didnt', 'cant', 'wont',
                     'https', 'www', 'com', 'reddit', 'one', 'out', 'amp', 'would', 'just',
                     'been', 'being', 'had', 'https', 'http', 'amp', 'quot'];
  
  const mainWords = mainKeyword.toLowerCase().split(' ');
  
  for (const post of results) {
    const text = (post.title + ' ' + post.text).toLowerCase();
    const words = text.match(/\b[a-z]{4,}\b/g) || [];
    
    for (const word of words) {
      if (!stopWords.includes(word) && !mainWords.includes(word) && word.length > 3) {
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    }
  }
  
  return Object.entries(wordCount)
    .filter(([word, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word, count]) => ({ word, count }));
}

function generateContentIdeas(questions, painPoints, keyword) {
  const ideas = [];
  
  for (const q of questions.slice(0, 3)) {
    ideas.push(`→ Answer: "${q.substring(0, 55)}..."`);
  }
  
  for (const p of painPoints.slice(0, 2)) {
    ideas.push(`→ Solve: "${p.title.substring(0, 50)}..."`);
  }
  
  ideas.push(`→ "Best ${keyword} in Toronto: A Local's Guide (2025)"`);
  ideas.push(`→ "${keyword} Cost in Toronto: What to Expect"`);
  ideas.push(`→ "Finding the Right ${keyword} in the GTA"`);
  
  return ideas.slice(0, 8);
}

app.post('/slack/commands/reddit', async (req, res) => {
  const keyword = req.body.text?.trim();
  
  if (!keyword) {
    return res.json({
      response_type: 'ephemeral',
      text: 'Usage: `/reddit [keyword]`\nExample: `/reddit dentist` or `/reddit teeth whitening`'
    });
  }
  
  res.json({
    response_type: 'in_channel',
    text: `🔍 Searching Reddit for *"${keyword}"* (Toronto/GTA focused)...`
  });
  
  const responseUrl = req.body.response_url;
  
  try {
    const results = await searchReddit(keyword);
    const questions = extractQuestions(results, keyword);
    const painPoints = extractPainPoints(results, keyword);
    const relatedKeywords = extractRelatedKeywords(results, keyword);
    const contentIdeas = generateContentIdeas(questions, painPoints, keyword);
    
    const torontoResults = results.filter(r => r.isToronto);
    
    let message = `*📊 Reddit Research: "${keyword}"*\n`;
    message += `_${results.length} posts found (${torontoResults.length} Toronto/GTA specific)_\n\n`;
    
    message += `*❓ Questions People Ask About ${keyword}:*\n`;
    if (questions.length > 0) {
      questions.slice(0, 8).forEach((q, i) => message += `${i + 1}. ${q.substring(0, 100)}\n`);
    } else {
      message += `_No questions found - try a different keyword_\n`;
    }
    
    message += `\n*🔑 Related Terms:*\n`;
    if (relatedKeywords.length > 0) {
      message += relatedKeywords.map(k => `\`${k.word}\``).join(', ') + '\n';
    } else {
      message += `_Not enough data_\n`;
    }
    
    message += `\n*😤 Pain Points:*\n`;
    if (painPoints.length > 0) {
      painPoints.slice(0, 5).forEach((p, i) => {
        message += `${i + 1}. ${p.title.substring(0, 80)}\n`;
      });
    } else {
      message += `_No pain points found_\n`;
    }
    
    message += `\n*💡 Content Ideas:*\n`;
    contentIdeas.forEach((idea, i) => message += `${i + 1}. ${idea}\n`);
    
    message += `\n*🍁 Toronto/GTA Posts:*\n`;
    if (torontoResults.length > 0) {
      torontoResults.slice(0, 5).forEach((post, i) => {
        message += `${i + 1}. r/${post.subreddit} - <${post.url}|${post.title.substring(0, 50)}...>\n`;
      });
    } else {
      message += `_No Toronto posts found_\n`;
    }
    
    await axios.post(responseUrl, {
      response_type: 'in_channel',
      text: message
    });
    
  } catch (error) {
    console.error('Error:', error);
    await axios.post(responseUrl, {
      response_type: 'ephemeral',
      text: `❌ Error: ${error.message}`
    });
  }
});

app.get('/', (req, res) => {
  res.send('Reddit Keyword Bot - Toronto Focused 🍁');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
