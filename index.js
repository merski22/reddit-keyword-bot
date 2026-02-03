const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

async function searchReddit(keyword) {
  const results = [];
  
  // Toronto-specific subreddits to search
  const torontoSubs = ['toronto', 'askTO', 'GTAmarket', 'OntarioCanada', 'PersonalFinanceCanada'];
  
  try {
    // Search 1: Keyword + Toronto in all of Reddit
    const response1 = await axios.get(`https://www.reddit.com/search.json`, {
      params: { q: `${keyword} toronto`, sort: 'relevance', limit: 50, t: 'year' },
      headers: { 'User-Agent': 'KeywordBot/1.0' }
    });
    
    const posts1 = response1.data?.data?.children || [];
    for (const post of posts1) {
      results.push({
        title: post.data.title,
        subreddit: post.data.subreddit,
        score: post.data.score,
        comments: post.data.num_comments,
        url: `https://reddit.com${post.data.permalink}`,
        text: post.data.selftext?.substring(0, 500) || ''
      });
    }
    
    // Search 2: Keyword in Toronto subreddits specifically
    for (const sub of torontoSubs) {
      try {
        const response2 = await axios.get(`https://www.reddit.com/r/${sub}/search.json`, {
          params: { q: keyword, restrict_sr: true, sort: 'relevance', limit: 20, t: 'year' },
          headers: { 'User-Agent': 'KeywordBot/1.0' }
        });
        
        const posts2 = response2.data?.data?.children || [];
        for (const post of posts2) {
          results.push({
            title: post.data.title,
            subreddit: post.data.subreddit,
            score: post.data.score,
            comments: post.data.num_comments,
            url: `https://reddit.com${post.data.permalink}`,
            text: post.data.selftext?.substring(0, 500) || ''
          });
        }
      } catch (e) {
        // Skip if subreddit doesn't exist or errors
      }
    }
    
    // Search 3: General keyword search for broader pain points
    const response3 = await axios.get(`https://www.reddit.com/search.json`, {
      params: { q: keyword, sort: 'relevance', limit: 30, t: 'year' },
      headers: { 'User-Agent': 'KeywordBot/1.0' }
    });
    
    const posts3 = response3.data?.data?.children || [];
    for (const post of posts3) {
      results.push({
        title: post.data.title,
        subreddit: post.data.subreddit,
        score: post.data.score,
        comments: post.data.num_comments,
        url: `https://reddit.com${post.data.permalink}`,
        text: post.data.selftext?.substring(0, 500) || ''
      });
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

function extractQuestions(results) {
  const questions = [];
  
  for (const post of results) {
    const title = post.title;
    if (title.includes('?') || 
        /^(how|what|why|where|when|which|can i|should i|is it|does|do i|has anyone|anyone know|any tips|any advice|looking for|recommend)/i.test(title)) {
      questions.push(title);
    }
  }
  
  return [...new Set(questions)].slice(0, 10);
}

function extractPainPoints(results) {
  const painPhrases = [
    'frustrated', 'annoying', 'annoyed', 'hate', 'problem', 'issue', 'struggle',
    'difficult', 'hard to', "can't", "won't", 'expensive', 'terrible', 'awful',
    'worst', 'bad experience', 'disappointed', 'scared', 'afraid', 'worried',
    'stressed', 'anxiety', 'anxious', 'nervous', 'fear', 'help me', 'need help',
    'driving me crazy', 'at my wits end', 'dont know what to do', 'desperate',
    'rip off', 'scam', 'overpriced', 'waste of money', 'never again', 'avoid'
  ];
  
  const painPoints = [];
  
  for (const post of results) {
    const text = (post.title + ' ' + post.text).toLowerCase();
    if (painPhrases.some(phrase => text.includes(phrase))) {
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
                     'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 
                     'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 
                     'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
                     'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here',
                     'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
                     'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
                     'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or',
                     'because', 'until', 'while', 'this', 'that', 'these', 'those', 'i', 
                     'me', 'my', 'myself', 'we', 'our', 'you', 'your', 'he', 'him', 'his',
                     'she', 'her', 'it', 'its', 'they', 'them', 'their', 'what', 'which',
                     'who', 'whom', 'any', 'get', 'got', 'about', 'also', 'like', 'know',
                     'think', 'want', 'going', 'really', 'even', 'much', 'dont', 'ive',
                     'im', 'doesnt', 'didnt', 'cant', 'wont', 'isnt', 'arent', 'wasnt',
                     'toronto', 'gta', 'ontario'];
  
  const mainWords = mainKeyword.toLowerCase().split(' ');
  
  for (const post of results) {
    const text = (post.title + ' ' + post.text).toLowerCase();
    const words = text.match(/\b[a-z]{3,}\b/g) || [];
    
    for (const word of words) {
      if (!stopWords.includes(word) && !mainWords.includes(word)) {
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    }
  }
  
  return Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word, count]) => ({ word, count }));
}

function generateContentIdeas(questions, painPoints, keyword) {
  const ideas = [];
  
  // Turn questions into content ideas
  for (const q of questions.slice(0, 4)) {
    ideas.push(`→ "${q.substring(0, 60)}..." - Write a guide answering this`);
  }
  
  // Turn pain points into content ideas  
  for (const p of painPoints.slice(0, 2)) {
    ideas.push(`→ Address: "${p.title.substring(0, 50)}..."`);
  }
  
  // Toronto-specific content templates
  ideas.push(`→ "Best ${keyword} in Toronto: A Local's Guide"`);
  ideas.push(`→ "${keyword} in the GTA: What You Need to Know in 2025"`);
  ideas.push(`→ "Toronto ${keyword}: Common Questions Answered"`);
  ideas.push(`→ "Why Toronto Residents Are Searching for ${keyword}"`);
  
  return ideas.slice(0, 10);
}

app.post('/slack/commands/reddit', async (req, res) => {
  const keyword = req.body.text?.trim();
  
  if (!keyword) {
    return res.json({
      response_type: 'ephemeral',
      text: 'Please provide a keyword. Example: `/reddit dental anxiety`'
    });
  }
  
  res.json({
    response_type: 'in_channel',
    text: `🔍 Searching Reddit (Toronto + GTA focused) for "${keyword}"...`
  });
  
  const responseUrl = req.body.response_url;
  
  try {
    const results = await searchReddit(keyword);
    const questions = extractQuestions(results);
    const painPoints = extractPainPoints(results);
    const relatedKeywords = extractRelatedKeywords(results, keyword);
    const contentIdeas = generateContentIdeas(questions, painPoints, keyword);
    
    // Separate Toronto-specific results
    const torontoResults = results.filter(r => 
      ['toronto', 'askto', 'gtamarket', 'ontariocanada'].includes(r.subreddit.toLowerCase()) ||
      r.title.toLowerCase().includes('toronto') ||
      r.text.toLowerCase().includes('toronto')
    );
    
    let message = `*📊 Reddit Research for "${keyword}"*\n`;
    message += `_Found ${results.length} total posts (${torontoResults.length} Toronto-specific)_\n\n`;
    
    // Questions section
    message += `*❓ Questions People Are Asking:*\n`;
    if (questions.length > 0) {
      questions.forEach((q, i) => message += `${i + 1}. ${q}\n`);
    } else {
      message += `_No direct questions found_\n`;
    }
    
    // Related keywords section
    message += `\n*🔑 Related Keywords/Topics:*\n`;
    if (relatedKeywords.length > 0) {
      message += relatedKeywords.map(k => `\`${k.word}\` (${k.count})`).join(', ') + '\n';
    }
    
    // Pain points section
    message += `\n*😤 Pain Points & Problems:*\n`;
    if (painPoints.length > 0) {
      painPoints.forEach((p, i) => {
        message += `${i + 1}. [r/${p.subreddit}] *${p.title.substring(0, 60)}*\n`;
      });
    } else {
      message += `_No specific pain points found_\n`;
    }
    
    // Content ideas section
    message += `\n*💡 Content Ideas for Your Blog:*\n`;
    contentIdeas.forEach((idea, i) => message += `${i + 1}. ${idea}\n`);
    
    // Toronto-specific posts
    message += `\n*🍁 Toronto/GTA Specific Posts:*\n`;
    if (torontoResults.length > 0) {
      torontoResults.slice(0, 5).forEach((post, i) => {
        message += `${i + 1}. r/${post.subreddit} (⬆️${post.score}) - <${post.url}|${post.title.substring(0, 50)}...>\n`;
      });
    } else {
      message += `_No Toronto-specific posts found - try a more local keyword_\n`;
    }
    
    // General top posts
    message += `\n*📝 Top General Posts:*\n`;
    results.slice(0, 5).forEach((post, i) => {
      message += `${i + 1}. r/${post.subreddit} (⬆️${post.score}) - <${post.url}|${post.title.substring(0, 50)}...>\n`;
    });
    
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
  res.send('Reddit Keyword Bot is running! 🍁 Toronto-focused');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
