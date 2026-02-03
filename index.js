const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Get these from environment variables (set in Railway)
const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;
const SEMRUSH_API_KEY = process.env.SEMRUSH_API_KEY;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

async function getRedditToken() {
  const auth = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64');
  const response = await axios.post(
    'https://www.reddit.com/api/v1/access_token',
    'grant_type=client_credentials',
    {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'KeywordBot/1.0'
      }
    }
  );
  return response.data.access_token;
}

async function searchReddit(keyword, token) {
  const results = [];
  const queries = [`${keyword} help`, `${keyword} problem`, `${keyword} recommend`, keyword];
  
  for (const query of queries) {
    try {
      const response = await axios.get('https://oauth.reddit.com/search', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'KeywordBot/1.0'
        },
        params: { q: query, sort: 'relevance', limit: 10, t: 'year' }
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
  
  // Remove duplicates
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

async function getSemrushData(keyword) {
  if (!SEMRUSH_API_KEY) return null;
  
  try {
    const response = await axios.get('https://api.semrush.com/', {
      params: {
        type: 'phrase_this',
        key: SEMRUSH_API_KEY,
        phrase: keyword,
        database: 'us'
      }
    });
    
    const lines = response.data.trim().split('\n');
    if (lines.length >= 2) {
      const headers = lines[0].split(';');
      const values = lines[1].split(';');
      const data = {};
      headers.forEach((h, i) => data[h] = values[i]);
      return data;
    }
  } catch (e) {
    console.error('SEMrush error:', e.message);
  }
  return null;
}

// Slack slash command endpoint
app.post('/slack/commands/reddit', async (req, res) => {
  const keyword = req.body.text?.trim();
  
  if (!keyword) {
    return res.json({
      response_type: 'ephemeral',
      text: 'Please provide a keyword. Example: `/reddit dental anxiety`'
    });
  }
  
  // Respond immediately to avoid timeout
  res.json({
    response_type: 'in_channel',
    text: `🔍 Searching Reddit for "${keyword}"... Results coming shortly!`
  });
  
  // Process in background and send results via response_url
  const responseUrl = req.body.response_url;
  
  try {
    const token = await getRedditToken();
    const results = await searchReddit(keyword, token);
    const questions = extractQuestions(results);
    const painPoints = extractPainPoints(results);
    const semrush = await getSemrushData(keyword);
    
    let message = `*📊 Results for "${keyword}"*\n\n`;
    
    if (semrush) {
      message += `*📈 Keyword Data:*\n`;
      message += `• Search Volume: ${semrush['Search Volume'] || 'N/A'}\n`;
      message += `• CPC: $${semrush['CPC'] || 'N/A'}\n`;
      message += `• Competition: ${semrush['Competition'] || 'N/A'}\n\n`;
    }
    
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

// Health check
app.get('/', (req, res) => {
  res.send('Reddit Keyword Bot is running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
