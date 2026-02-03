const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

async function searchReddit(keyword) {
  const results = [];
  
  try {
    const searches = [
      `${keyword}`,
      `${keyword} help`,
      `${keyword} problem`,
      `${keyword} recommend`,
      `${keyword} toronto`,
      `${keyword} ontario`,
      `${keyword} canada`,
      `${keyword} GTA`
    ];
    
    for (const query of searches) {
      const response = await axios.get(`https://www.reddit.com/search.json`, {
        params: { q: query, sort: 'relevance', limit: 25, t: 'year' },
        headers: { 'User-Agent': 'KeywordBot/1.0' }
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
    }
    
    // Search Ontario/Toronto specific subreddits
    const localSubs = ['toronto', 'askTO', 'ontario', 'OntarioCanada', 'PersonalFinanceCanada', 'canadasmallbusiness'];
    for (const sub of localSubs) {
      try {
        const response = await axios.get(`https://www.reddit.com/r/${sub}/search.json`, {
          params: { q: keyword, restrict_sr: true, sort: 'relevance', limit: 20, t: 'all' },
          headers: { 'User-Agent': 'KeywordBot/1.0' }
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
      } catch (e) {}
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
  }).slice(0, 60);
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
- Press releases or company announcements

ONLY include genuine questions, complaints, and discussions from real users/customers.

REDDIT POSTS:
${postText}

Based ONLY on posts that are actually relevant to "${keyword}" and are GENUINE user discussions (not marketing), provide:

1. QUESTIONS (5-8): Real questions people are asking about ${keyword}. Only include genuine questions from users seeking help or information.

2. PAIN POINTS (5-8): Specific problems, frustrations, or complaints about ${keyword}. These should be real user experiences, not fabricated marketing pain points.

3. RELATED KEYWORDS (8-12): Other terms, phrases, or topics people mention alongside ${keyword}. These should be useful for SEO.

4. CONTENT IDEAS (5-6): Blog post titles that would answer these questions or solve these pain points. Make them specific and actionable for a Toronto/GTA/Ontario audience.

5. LOCAL INSIGHTS: Note any posts specifically from Toronto, GTA, or Ontario. Highlight any local trends, preferences, or concerns unique to this market.

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
[any local insights, trends, or "No local posts found - here are general insights that apply to this market"]

If there are NO relevant non-promotional posts about "${keyword}", say so clearly and suggest the user try a different keyword.`;

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
    text: `🔍 Researching *"${keyword}"* on Reddit...\n_Searching Toronto, GTA & Ontario communities (filtering out spam/ads)..._`
  });
  
  const responseUrl = req.body.response_url;
  
  try {
    const posts = await searchReddit(keyword);
    
    if (posts.length === 0) {
      await axios.post(responseUrl, {
        response_type: 'in_channel',
        text: `❌ No Reddit posts found for "${keyword}". Try a different keyword.`
      });
      return;
    }
    
    const analysis = await analyzeWithClaude(keyword, posts);
    
    const message = `*📊 Reddit Research: "${keyword}"*\n_Analyzed ${posts.length} posts (Toronto/GTA/Ontario focused, spam filtered)_\n\n${analysis}`;
    
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
  res.send('Reddit Keyword Bot + Claude AI 🍁 Toronto/GTA/Ontario (Spam Filtered)');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
