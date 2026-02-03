const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// Helper function to delay between requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function searchReddit(keyword) {
  const results = [];
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
  };
  
  try {
    // Main searches with delays
    const searches = [
      `${keyword}`,
      `${keyword} toronto`,
      `${keyword} ontario`,
      `${keyword} problem`,
      `${keyword} help`
    ];
    
    for (const query of searches) {
      try {
        await delay(1000); // Wait 1 second between requests
        
        const response = await axios.get(`https://www.reddit.com/search.json`, {
          params: { q: query, sort: 'relevance', limit: 20, t: 'year' },
          headers: headers,
          timeout: 10000
        });
        
        const posts = response.data?.data?.children || [];
        for (const post of posts) {
          results.push({
            title: post.data.title,
            subreddit: post.data.subreddit,
            text: post.data.selftext?.substring(0, 300) || '',
            url: `https://reddit.com${post.data.permalink}`
          });
        }
      } catch (e) {
        console.error(`Search error for "${query}":`, e.message);
      }
    }
    
    // Search local subreddits with delays
    const localSubs = ['toronto', 'askTO', 'ontario'];
    for (const sub of localSubs) {
      try {
        await delay(1000);
        
        const response = await axios.get(`https://www.reddit.com/r/${sub}/search.json`, {
          params: { q: keyword, restrict_sr: true, sort: 'relevance', limit: 15, t: 'all' },
          headers: headers,
          timeout: 10000
        });
        
        const posts = response.data?.data?.children || [];
        for (const post of posts) {
          results.push({
            title: post.data.title,
            subreddit: post.data.subreddit,
            text: post.data.selftext?.substring(0, 300) || '',
            url: `https://reddit.com${post.data.permalink}`
          });
        }
      } catch (e) {
        console.error(`Subreddit search error for r/${sub}:`, e.message);
      }
    }
    
  } catch (e) {
    console.error('Reddit error:', e.message);
  }
  
  // Remove duplicates
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  }).slice(0, 50);
}

async function analyzeWithClaude(keyword, posts) {
  const postText = posts.map((p, i) => 
    `${i + 1}. [r/${p.subreddit}] ${p.title}\n${p.text ? `   "${p.text.substring(0, 150)}..."` : ''}`
  ).join('\n\n');
  
  const prompt = `You are a keyword research assistant for businesses targeting customers in Toronto, the GTA (Greater Toronto Area), and Ontario, Canada.

Analyze these Reddit posts about "${keyword}" and extract insights for content marketing.

IMPORTANT: IGNORE and DO NOT include any of the following:
- Self-promotional posts from businesses advertising their services
- Spam or marketing content
- Posts that are just ads disguised as questions
- "Check out my business" or "We offer..." type posts
- Affiliate links or promotional content

ONLY include genuine questions, complaints, and discussions from real users/customers.

REDDIT POSTS:
${postText}

Based ONLY on posts that are actually relevant to "${keyword}" and are GENUINE user discussions (not marketing), provide:

1. QUESTIONS (5-8): Real questions people are asking about ${keyword}. Only include genuine questions from users seeking help or information.

2. PAIN POINTS (5-8): Specific problems, frustrations, or complaints about ${keyword}. These should be real user experiences.

3. RELATED KEYWORDS (8-12): Other terms, phrases, or topics people mention alongside ${keyword}. Useful for SEO.

4. CONTENT IDEAS (5-6): Blog post titles that would answer these questions or solve these pain points. Make them specific for Toronto/GTA/Ontario audience.

5. LOCAL INSIGHTS: Note any posts from Toronto, GTA, or Ontario. Highlight local trends or concerns.

Format your response EXACTLY like this:

❓ QUESTIONS:
1. [question]
2. [question]
...

😤 PAIN POINTS:
1. [pain point]
2. [pain point]
...

🔑 RELATED KEYWORDS:
keyword1, keyword2, keyword3...

💡 CONTENT IDEAS:
1. [blog title idea]
2. [blog title idea]
...

🍁 TORONTO/GTA/ONTARIO INSIGHTS:
[local insights or "No local posts found - general insights apply"]

If NO relevant non-promotional posts exist, say so and suggest a different keyword.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }]
  });
  
  return response.content[0].text;
}

app.post('/slack/commands/reddit', async (req, res) => {
  const keyword = req.body.text?.trim();
  
  if (!keyword) {
    return res.json({
      response_type: 'ephemeral',
      text: 'Usage: `/reddit [keyword]`\nExamples:\n• `/reddit hot tub repair`\n• `/reddit AI phone answering`\n• `/reddit virtual receptionist`'
    });
  }
  
  res.json({
    response_type: 'in_channel',
    text: `🔍 Researching *"${keyword}"* on Reddit...\n_Searching Toronto, GTA & Ontario (this may take 15-20 seconds)..._`
  });
  
  const responseUrl = req.body.response_url;
  
  try {
    const posts = await searchReddit(keyword);
    
    if (posts.length === 0) {
      await axios.post(responseUrl, {
        response_type: 'in_channel',
        text: `❌ No Reddit posts found for "${keyword}". Try a broader keyword like "phone answering" instead of "AI phone answering".`
      });
      return;
    }
    
    const analysis = await analyzeWithClaude(keyword, posts);
    
    const message = `*📊 Reddit Research: "${keyword}"*\n_Analyzed ${posts.length} posts (Toronto/GTA/Ontario focused)_\n\n${analysis}`;
    
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
  res.send('Reddit Keyword Bot + Claude AI 🍁');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
