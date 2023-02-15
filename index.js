const Koa = require("koa");
const Router = require("koa-router");
const logger = require("koa-logger");
const bodyParser = require("koa-bodyparser");
const fs = require("fs");
const path = require("path");
const { init: initDB, Counter, Answer } = require("./db");
const { Configuration, OpenAIApi } = require("openai");

const router = new Router();

const homePage = fs.readFileSync(path.join(__dirname, "index.html"), "utf-8");
const configuration = new Configuration({
  apiKey: "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",
});
const openai = new OpenAIApi(configuration);

async function getAIResponse(prompt) {
  console.log("getAIResponse", prompt)
  let ans = await Answer.findOne({
    where: {question: prompt}
  })
  console.log("getAIResponse findOne", ans)
  if(ans) {
    return ans.answer;
  }
  try{
    const completion = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt,
      max_tokens: 1024,
      temperature: 0.1,
    });
    console.log("getAIResponse completion", completion)
    if(completion?.data?.choices) {    
      const qa = {
        question: prompt,
        answer: completion.data.choices[0].text
      }
      await Answer.create(qa);
      console.log("getAIResponse Answer.create", qa)
    }
    return (completion?.data?.choices?.[0].text || '我听不懂呢，请换个问题').trim();
  } catch(e) {
    console.log("createCompletion error", e)
    return ('好像哪里出问题了').trim();
  }
}
async function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  }) 
}
router.post('/message/post', async ctx => {
  const { ToUserName, FromUserName, Content, CreateTime } = ctx.request.body;
  console.log(FromUserName, Content)
  const response = await Promise.race([
    // 3秒微信服务器就会超时，超过2.9秒要提示用户重试
    sleep(900).then(() => "我要再想一下，您待会再问可以吗？"),
    getAIResponse(Content ),
  ]);
  console.log("response", response)
  ctx.body = {
    ToUserName: FromUserName,
    FromUserName: ToUserName,
    CreateTime: +new Date(),
    MsgType: 'text',
    
    Content: response,
  };
});
router.post('/drop_chatdb', async ctx => {
  let result = await Answer.destroy({
    where: {},
    truncate: true
  })
  ctx.body = {
    Content: `删除结果: ${result}`,
  };
});

// 一个用户发什么消息，就反弹什么消息的消息回复功能
router.post('/echo', async ctx => {
  const { ToUserName, FromUserName, Content, CreateTime } = ctx.request.body;
  console.log(ToUserName, FromUserName, Content, CreateTime);
  ctx.body = {
    ToUserName: FromUserName,
    FromUserName: ToUserName,
    CreateTime: +new Date(),
    MsgType: 'text',
    Content: `你发的消息：${Content}`,
  };
});
// 首页
router.get("/", async (ctx) => {
  ctx.body = homePage;
});
// 更新计数
router.post("/api/count", async (ctx) => {
  const { request } = ctx;
  const { action } = request.body;
  if (action === "inc") {
    await Counter.create();
  } else if (action === "clear") {
    await Counter.destroy({
      truncate: true,
    });
  }

  ctx.body = {
    code: 0,
    data: await Counter.count(),
  };
});

// 获取计数
router.get("/api/count", async (ctx) => {
  const result = await Counter.count();

  ctx.body = {
    code: 0,
    data: result,
  };
});

// 小程序调用，获取微信 Open ID
router.get("/api/wx_openid", async (ctx) => {
  if (ctx.request.headers["x-wx-source"]) {
    ctx.body = ctx.request.headers["x-wx-openid"];
  }
});

const app = new Koa();
app
  .use(logger())
  .use(bodyParser())
  .use(router.routes())
  .use(router.allowedMethods());

const port = process.env.PORT || 80;
async function bootstrap() {
  await initDB();
  app.listen(port, () => {
    console.log("启动成功", port);
  });
}
bootstrap();
