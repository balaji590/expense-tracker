// Express has no built-in way to READ incoming cookies (only to SET them via
// res.cookie). Adding the `cookie-parser` package for this one need felt like
// exactly the kind of "unnecessary dependency" these phases keep asking to
// avoid, given how small the actual parsing logic is.
function parseCookies(cookieHeader){
  const cookies = {};
  if(!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if(idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    try{
      cookies[key] = decodeURIComponent(value);
    }catch(e){
      cookies[key] = value; // malformed encoding — keep the raw value rather than throwing
    }
  });
  return cookies;
}

module.exports = { parseCookies };
