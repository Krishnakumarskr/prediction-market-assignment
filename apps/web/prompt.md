Kalshi: https://api.elections.kalshi.com/trade-api/v2/markets/KXRECOGPERSONIRAN-26
Polymarket: https://gamma-api.polymarket.com/markets?slug=us-recognizes-reza-pahlavi-as-leader-of-iran-in2026


For Kalshi use Dflow api key and code reference:
https://pond.dflow.net/build/metadata-api/websockets/orderbook#subscribe-to-specific-markets

For Polymarket: https://docs.polymarket.com/api-reference/wss/market
For llms: https://docs.polymarket.com/llms.txt

Task: 
First plan out:
- Give me a plan to implement the given assignment
- From the config get the market ticker of kalshi and slug of polymarket. We will using only only market(similar markets on both venue) but i should be able to change that market later just by chaning the ticker and slug form config.
- Use Dflow api for kalshi and polymarket wss for polymarket.
- Refer frontend-desing skills under .claude/skills/frontend-design/. Must implement the Ui by referring to this.
- No need of backend as of now
- make all the changes in react vite under @apps/web (the current repo is a turbo repo) . no other folders has to be touched.
- Use the frontend-desing skills make the ui intiutive and use shadcn/ui components.
- On quoting when user entered usd amount should show proper fill across the venue and also a text on who good the % is on using our app instead of individually buying on polymarket or kalshi.
- We are doing smart order routing basically. show combined orderbook and other charts requried with good intuitive desing using the frontend-skills
- Follow all the constrainsts and all the expectations given in the assignment.
  

