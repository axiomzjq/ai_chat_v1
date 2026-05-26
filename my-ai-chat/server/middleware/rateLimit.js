// 内存级限流（开发环境足够，生产环境建议用 Redis）
const requestMap = new Map(); // userId -> [timestamps]

const LIMITS = {
  message: { windowMs: 60 * 1000, max: 10 },      // 10 req/min
  upload: { windowMs: 60 * 1000, max: 5 },         // 5 req/min
  search: { windowMs: 60 * 1000, max: 20 },        // 20 req/min
  default: { windowMs: 60 * 1000, max: 60 },       // 60 req/min
};

function isLimited(userId, config) {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  
  if (!requestMap.has(userId)) {
    requestMap.set(userId, []);
  }
  
  const timestamps = requestMap.get(userId);
  // 清理过期记录
  const valid = timestamps.filter(t => t > windowStart);
  
  if (valid.length >= config.max) {
    requestMap.set(userId, valid);
    return true;
  }
  
  valid.push(now);
  requestMap.set(userId, valid);
  return false;
}

// 清理内存（每小时）
setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamps] of requestMap.entries()) {
    const valid = timestamps.filter(t => t > now - 60 * 60 * 1000);
    if (valid.length === 0) {
      requestMap.delete(userId);
    } else {
      requestMap.set(userId, valid);
    }
  }
}, 60 * 60 * 1000);

export function rateLimitMiddleware(type = 'default') {
  const config = LIMITS[type] || LIMITS.default;
  return (req, res, next) => {
    const userId = req.user?.id || req.ip;
    if (isLimited(userId, config)) {
      return res.status(429).json({ code: 429, message: '请求过于频繁，请稍后再试', data: null });
    }
    next();
  };
}
