-- Add render_options + template_options columns
ALTER TABLE public.render_jobs ADD COLUMN IF NOT EXISTS render_options JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Remove old built-in templates so we can seed richer ones
DELETE FROM public.templates WHERE is_default = true;

-- Seed 10 realistic Shorts templates with real scene structures
INSERT INTO public.templates (id, user_id, name, type, aspect_ratio, template_json, is_default, thumbnail_url) VALUES
(gen_random_uuid(), NULL, 'Motivation Quote', 'quote', '9:16', '{
  "version": 1, "aspect": "9:16",
  "variables": ["quote", "author", "cta"],
  "audio": {"volume": 0.6},
  "scenes": [{
    "id": "s1", "name": "Main", "durationMs": 8000, "background": "#0A0A0A",
    "elements": [
      {"id":"bg","type":"video","x":0,"y":0,"w":1080,"h":1920,"rotation":0,"opacity":0.35,"src":"{{background}}","fit":"cover","muted":true,"loop":true,"autoplay":true},
      {"id":"grad","type":"shape","x":0,"y":900,"w":1080,"h":1020,"rotation":0,"opacity":0.85,"shape":"rect","fill":"#000000"},
      {"id":"quote","type":"text","x":80,"y":760,"w":920,"h":700,"rotation":0,"opacity":1,"text":"\"{{quote}}\"","fontFamily":"Plus Jakarta Sans","fontSize":88,"fontWeight":800,"color":"#FFFFFF","align":"center"},
      {"id":"author","type":"text","x":80,"y":1520,"w":920,"h":80,"rotation":0,"opacity":0.85,"text":"— {{author}}","fontFamily":"Plus Jakarta Sans","fontSize":42,"fontWeight":500,"color":"#FF0033","align":"center"},
      {"id":"cta","type":"text","x":80,"y":1720,"w":920,"h":60,"rotation":0,"opacity":0.6,"text":"{{cta}}","fontFamily":"Inter","fontSize":34,"fontWeight":600,"color":"#FFFFFF","align":"center"}
    ]
  }]
}'::jsonb, true, NULL),
(gen_random_uuid(), NULL, 'Daily Tip', 'tip', '9:16', '{
  "version":1,"aspect":"9:16","variables":["tip_number","tip_title","tip_body","hashtag"],"audio":{"volume":0.5},
  "scenes":[{"id":"s1","name":"Main","durationMs":7000,"background":"#0F0F14","elements":[
    {"id":"bg","type":"video","x":0,"y":0,"w":1080,"h":1920,"rotation":0,"opacity":0.4,"src":"{{background}}","fit":"cover","muted":true,"loop":true,"autoplay":true},
    {"id":"badge","type":"shape","x":80,"y":180,"w":260,"h":80,"rotation":0,"opacity":1,"shape":"rect","fill":"#FF0033","radius":40},
    {"id":"badgeText","type":"text","x":80,"y":180,"w":260,"h":80,"rotation":0,"opacity":1,"text":"TIP #{{tip_number}}","fontFamily":"Plus Jakarta Sans","fontSize":32,"fontWeight":800,"color":"#FFFFFF","align":"center"},
    {"id":"title","type":"text","x":80,"y":320,"w":920,"h":260,"rotation":0,"opacity":1,"text":"{{tip_title}}","fontFamily":"Plus Jakarta Sans","fontSize":96,"fontWeight":900,"color":"#FFFFFF","align":"left"},
    {"id":"body","type":"text","x":80,"y":640,"w":920,"h":900,"rotation":0,"opacity":0.9,"text":"{{tip_body}}","fontFamily":"Inter","fontSize":44,"fontWeight":500,"color":"#E4E4E7","align":"left"},
    {"id":"tag","type":"text","x":80,"y":1780,"w":920,"h":60,"rotation":0,"opacity":0.7,"text":"{{hashtag}}","fontFamily":"Inter","fontSize":36,"fontWeight":700,"color":"#FF0033","align":"left"}
  ]}]
}'::jsonb, true, NULL),
(gen_random_uuid(), NULL, 'Did You Know', 'fact', '9:16', '{
  "version":1,"aspect":"9:16","variables":["fact","source"],"audio":{"volume":0.5},
  "scenes":[{"id":"s1","name":"Main","durationMs":7000,"background":"#08090C","elements":[
    {"id":"bg","type":"video","x":0,"y":0,"w":1080,"h":1920,"rotation":0,"opacity":0.5,"src":"{{background}}","fit":"cover","muted":true,"loop":true,"autoplay":true},
    {"id":"eyebrow","type":"text","x":80,"y":260,"w":920,"h":80,"rotation":0,"opacity":1,"text":"DID YOU KNOW?","fontFamily":"Plus Jakarta Sans","fontSize":48,"fontWeight":800,"color":"#FF0033","align":"center"},
    {"id":"fact","type":"text","x":80,"y":600,"w":920,"h":800,"rotation":0,"opacity":1,"text":"{{fact}}","fontFamily":"Plus Jakarta Sans","fontSize":80,"fontWeight":800,"color":"#FFFFFF","align":"center"},
    {"id":"source","type":"text","x":80,"y":1700,"w":920,"h":60,"rotation":0,"opacity":0.5,"text":"Source: {{source}}","fontFamily":"Inter","fontSize":28,"fontWeight":500,"color":"#A1A1AA","align":"center"}
  ]}]
}'::jsonb, true, NULL),
(gen_random_uuid(), NULL, 'Breaking News', 'news', '9:16', '{
  "version":1,"aspect":"9:16","variables":["headline","summary","category"],"audio":{"volume":0.6},
  "scenes":[{"id":"s1","name":"Main","durationMs":8000,"background":"#0A0A0A","elements":[
    {"id":"bg","type":"video","x":0,"y":0,"w":1080,"h":1920,"rotation":0,"opacity":0.55,"src":"{{background}}","fit":"cover","muted":true,"loop":true,"autoplay":true},
    {"id":"bar","type":"shape","x":0,"y":1360,"w":1080,"h":560,"rotation":0,"opacity":0.9,"shape":"rect","fill":"#000000"},
    {"id":"stripe","type":"shape","x":80,"y":1400,"w":220,"h":56,"rotation":0,"opacity":1,"shape":"rect","fill":"#FF0033"},
    {"id":"stripeText","type":"text","x":80,"y":1400,"w":220,"h":56,"rotation":0,"opacity":1,"text":"{{category}}","fontFamily":"Plus Jakarta Sans","fontSize":28,"fontWeight":800,"color":"#FFFFFF","align":"center"},
    {"id":"head","type":"text","x":80,"y":1480,"w":920,"h":260,"rotation":0,"opacity":1,"text":"{{headline}}","fontFamily":"Plus Jakarta Sans","fontSize":72,"fontWeight":900,"color":"#FFFFFF","align":"left"},
    {"id":"sum","type":"text","x":80,"y":1760,"w":920,"h":120,"rotation":0,"opacity":0.85,"text":"{{summary}}","fontFamily":"Inter","fontSize":34,"fontWeight":500,"color":"#D4D4D8","align":"left"}
  ]}]
}'::jsonb, true, NULL),
(gen_random_uuid(), NULL, 'Product Showcase', 'product', '9:16', '{
  "version":1,"aspect":"9:16","variables":["product_name","tagline","price","cta"],"audio":{"volume":0.6},
  "scenes":[{"id":"s1","name":"Main","durationMs":8000,"background":"#0A0A0A","elements":[
    {"id":"bg","type":"video","x":0,"y":0,"w":1080,"h":1920,"rotation":0,"opacity":0.35,"src":"{{background}}","fit":"cover","muted":true,"loop":true,"autoplay":true},
    {"id":"name","type":"text","x":80,"y":260,"w":920,"h":220,"rotation":0,"opacity":1,"text":"{{product_name}}","fontFamily":"Plus Jakarta Sans","fontSize":96,"fontWeight":900,"color":"#FFFFFF","align":"left"},
    {"id":"tag","type":"text","x":80,"y":500,"w":920,"h":140,"rotation":0,"opacity":0.8,"text":"{{tagline}}","fontFamily":"Inter","fontSize":44,"fontWeight":500,"color":"#D4D4D8","align":"left"},
    {"id":"price","type":"text","x":80,"y":1500,"w":600,"h":140,"rotation":0,"opacity":1,"text":"{{price}}","fontFamily":"Plus Jakarta Sans","fontSize":120,"fontWeight":900,"color":"#FF0033","align":"left"},
    {"id":"cta","type":"shape","x":80,"y":1720,"w":920,"h":100,"rotation":0,"opacity":1,"shape":"rect","fill":"#FF0033","radius":16},
    {"id":"ctaText","type":"text","x":80,"y":1720,"w":920,"h":100,"rotation":0,"opacity":1,"text":"{{cta}}","fontFamily":"Plus Jakarta Sans","fontSize":44,"fontWeight":800,"color":"#FFFFFF","align":"center"}
  ]}]
}'::jsonb, true, NULL),
(gen_random_uuid(), NULL, 'Recipe Card', 'recipe', '9:16', '{
  "version":1,"aspect":"9:16","variables":["dish","time","ingredients","step"],"audio":{"volume":0.5},
  "scenes":[{"id":"s1","name":"Main","durationMs":9000,"background":"#0C0A08","elements":[
    {"id":"bg","type":"video","x":0,"y":0,"w":1080,"h":1920,"rotation":0,"opacity":0.5,"src":"{{background}}","fit":"cover","muted":true,"loop":true,"autoplay":true},
    {"id":"dish","type":"text","x":80,"y":220,"w":920,"h":220,"rotation":0,"opacity":1,"text":"{{dish}}","fontFamily":"Georgia","fontSize":100,"fontWeight":700,"color":"#FFF8E7","align":"left"},
    {"id":"time","type":"text","x":80,"y":460,"w":920,"h":60,"rotation":0,"opacity":0.75,"text":"⏱ {{time}}","fontFamily":"Inter","fontSize":36,"fontWeight":600,"color":"#F5A524","align":"left"},
    {"id":"ingLabel","type":"text","x":80,"y":900,"w":920,"h":60,"rotation":0,"opacity":0.6,"text":"INGREDIENTS","fontFamily":"Plus Jakarta Sans","fontSize":28,"fontWeight":800,"color":"#F5A524","align":"left"},
    {"id":"ing","type":"text","x":80,"y":960,"w":920,"h":500,"rotation":0,"opacity":0.95,"text":"{{ingredients}}","fontFamily":"Inter","fontSize":40,"fontWeight":500,"color":"#FFF8E7","align":"left"},
    {"id":"step","type":"text","x":80,"y":1700,"w":920,"h":140,"rotation":0,"opacity":0.85,"text":"Step: {{step}}","fontFamily":"Inter","fontSize":34,"fontWeight":600,"color":"#FFFFFF","align":"left"}
  ]}]
}'::jsonb, true, NULL),
(gen_random_uuid(), NULL, 'Story Slide', 'story', '9:16', '{
  "version":1,"aspect":"9:16","variables":["story_title","paragraph","chapter"],"audio":{"volume":0.55},
  "scenes":[{"id":"s1","name":"Main","durationMs":9000,"background":"#0A0A0A","elements":[
    {"id":"bg","type":"video","x":0,"y":0,"w":1080,"h":1920,"rotation":0,"opacity":0.5,"src":"{{background}}","fit":"cover","muted":true,"loop":true,"autoplay":true},
    {"id":"chap","type":"text","x":80,"y":220,"w":920,"h":60,"rotation":0,"opacity":0.6,"text":"CHAPTER {{chapter}}","fontFamily":"Plus Jakarta Sans","fontSize":28,"fontWeight":800,"color":"#FF0033","align":"left"},
    {"id":"title","type":"text","x":80,"y":280,"w":920,"h":180,"rotation":0,"opacity":1,"text":"{{story_title}}","fontFamily":"Georgia","fontSize":78,"fontWeight":700,"color":"#FFFFFF","align":"left"},
    {"id":"para","type":"text","x":80,"y":720,"w":920,"h":1100,"rotation":0,"opacity":0.9,"text":"{{paragraph}}","fontFamily":"Georgia","fontSize":46,"fontWeight":400,"color":"#E4E4E7","align":"left"}
  ]}]
}'::jsonb, true, NULL),
(gen_random_uuid(), NULL, 'Countdown', 'countdown', '9:16', '{
  "version":1,"aspect":"9:16","variables":["event","date","subtitle"],"audio":{"volume":0.6},
  "scenes":[{"id":"s1","name":"Main","durationMs":6000,"background":"#08090C","elements":[
    {"id":"bg","type":"video","x":0,"y":0,"w":1080,"h":1920,"rotation":0,"opacity":0.45,"src":"{{background}}","fit":"cover","muted":true,"loop":true,"autoplay":true},
    {"id":"date","type":"text","x":80,"y":220,"w":920,"h":80,"rotation":0,"opacity":1,"text":"{{date}}","fontFamily":"Plus Jakarta Sans","fontSize":40,"fontWeight":700,"color":"#FF0033","align":"center"},
    {"id":"event","type":"text","x":80,"y":700,"w":920,"h":520,"rotation":0,"opacity":1,"text":"{{event}}","fontFamily":"Plus Jakarta Sans","fontSize":160,"fontWeight":900,"color":"#FFFFFF","align":"center"},
    {"id":"sub","type":"text","x":80,"y":1400,"w":920,"h":80,"rotation":0,"opacity":0.7,"text":"{{subtitle}}","fontFamily":"Inter","fontSize":40,"fontWeight":500,"color":"#D4D4D8","align":"center"}
  ]}]
}'::jsonb, true, NULL),
(gen_random_uuid(), NULL, 'Meme Caption', 'meme', '9:16', '{
  "version":1,"aspect":"9:16","variables":["top_text","bottom_text"],"audio":{"volume":0.7},
  "scenes":[{"id":"s1","name":"Main","durationMs":5000,"background":"#000000","elements":[
    {"id":"bg","type":"video","x":0,"y":0,"w":1080,"h":1920,"rotation":0,"opacity":1,"src":"{{background}}","fit":"cover","muted":true,"loop":true,"autoplay":true},
    {"id":"top","type":"text","x":40,"y":120,"w":1000,"h":260,"rotation":0,"opacity":1,"text":"{{top_text}}","fontFamily":"Impact","fontSize":96,"fontWeight":900,"color":"#FFFFFF","align":"center","stroke":"#000000"},
    {"id":"bottom","type":"text","x":40,"y":1560,"w":1000,"h":260,"rotation":0,"opacity":1,"text":"{{bottom_text}}","fontFamily":"Impact","fontSize":96,"fontWeight":900,"color":"#FFFFFF","align":"center","stroke":"#000000"}
  ]}]
}'::jsonb, true, NULL),
(gen_random_uuid(), NULL, 'Tutorial Step', 'tutorial', '9:16', '{
  "version":1,"aspect":"9:16","variables":["step_number","step_title","step_body","tool"],"audio":{"volume":0.55},
  "scenes":[{"id":"s1","name":"Main","durationMs":8000,"background":"#0A0A0F","elements":[
    {"id":"bg","type":"video","x":0,"y":0,"w":1080,"h":1920,"rotation":0,"opacity":0.4,"src":"{{background}}","fit":"cover","muted":true,"loop":true,"autoplay":true},
    {"id":"stepBg","type":"shape","x":80,"y":200,"w":180,"h":180,"rotation":0,"opacity":1,"shape":"ellipse","fill":"#FF0033"},
    {"id":"stepNum","type":"text","x":80,"y":200,"w":180,"h":180,"rotation":0,"opacity":1,"text":"{{step_number}}","fontFamily":"Plus Jakarta Sans","fontSize":100,"fontWeight":900,"color":"#FFFFFF","align":"center"},
    {"id":"tool","type":"text","x":300,"y":220,"w":720,"h":60,"rotation":0,"opacity":0.7,"text":"USING {{tool}}","fontFamily":"Plus Jakarta Sans","fontSize":32,"fontWeight":800,"color":"#FF0033","align":"left"},
    {"id":"title","type":"text","x":300,"y":280,"w":720,"h":140,"rotation":0,"opacity":1,"text":"{{step_title}}","fontFamily":"Plus Jakarta Sans","fontSize":68,"fontWeight":900,"color":"#FFFFFF","align":"left"},
    {"id":"body","type":"text","x":80,"y":900,"w":920,"h":900,"rotation":0,"opacity":0.9,"text":"{{step_body}}","fontFamily":"Inter","fontSize":44,"fontWeight":500,"color":"#E4E4E7","align":"left"}
  ]}]
}'::jsonb, true, NULL);