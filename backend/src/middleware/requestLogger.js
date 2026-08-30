function requestLogger(req, res, next){
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    // Deliberately never logs req.body — expense amounts, emails, etc. have
    // no business being in server logs by default.
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
  });
  next();
}

module.exports = requestLogger;
