function notFound(req, res){
  res.status(404).json({ error: `No route: ${req.method} ${req.originalUrl}` });
}

module.exports = notFound;
