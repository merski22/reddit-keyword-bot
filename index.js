const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

async function searchReddit(keyword) {
  const results = [];
  const queries = [`${keyword}+help`, `${keyword}+problem`, `${keyword}+recommend`, keyword];
  
  for (const query of queries) {
    try {
      const response = await axios.get(`https://www.reddit.com/search.json`, {
        params: { q: query, sort: 'relevance', limit: 10, t: 'year' },
        headers: { 'User-Agent': 'KeywordBot/1.0' }
      });
      
      const posts = response.data?.data?.children || [];
      for (const post of posts) {
        results.push({
          title: post.data.title,
          subreddit: post.data.subreddit,
          score: post.data.score,
          comments: post.data.num_comments,
          url: `https://reddit.com${post.data.permalink}`,
          text: post.data.selftext?.substring(0, 300) || ''
        });
      }
    } catch (e) {
      console.error('Reddit search error:', e.message);
    }
  }
  
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

function extractQuestions(results) {
  const questionWords = ['how', 'what', 'why', 'where', 'when', 'which', 'can i', 'should i', 'is it', 'does', 'do i'];
  const questions = [];
  
  for (const post of results) {
    const title = post.title.toLowerCase();
    if (questionWords.some(w => title.startsWith(w) || title.includes(` ${w}`))) {
      questions.push(post.title);
    }
  }
  
  return [...new Set(questions)].slice(0, 10);
}

function extractPainPoints(results) {
  const painWords = ['frustrated', 'annoying', 'hate', 'problem', 'issue', 'struggle', 
                     'difficult', 'hard', "can't", "won't", 'expensive', 'terrible',
                     'worst', 'bad', 'disappointed', 'scared', 'afraid', 'worried'];
  const painPoints = [];
  
  for (const post of results) {
    const text = (post.title + ' ' + post.text).toLowerCase();
    if (painWords.some(w => text.includes(w))) {
      painPoints.push(post.title);
    }
  }
  
  return [...new Set(painPoints)].slice(0, 10);
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
    text: `🔍 Searching Reddit for "${keyword}"...`
  });
  
  const responseUrl = req.body.response_url;
  
  try {
    const results = await searchReddit(keyword);
    const questions = extractQuestions(results);
    const painPoints = extractPainPoints(results);
    
    let message = `*📊 Results for "${keyword}"*\n\n`;
    
    message += `*❓ Questions People Ask (${questions.length}):*\n`;
    questions.forEach((q, i) => message += `${i + 1}. ${q}\n`);
    
    message += `\n*😤 Pain Points (${painPoints.length}):*\n`;
    painPoints.forEach((p, i) => message += `${i + 1}. ${p}\n`);
    
    message += `\n*📝 Top Posts (${Math.min(results.length, 5)}):*\n`;
    results.slice(0, 5).forEach((post, i) => {
      message += `${i + 1}. r/${post.subreddit} - <${post.url}|${post.title.substring(0, 50)}...>\n`;
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
  res.send('Reddit Keyword Bot is running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
