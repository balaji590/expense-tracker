const { ValidationError } = require('../errors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateField(location, field, value, rule, errors){
  if(rule.required && (value === undefined || value === null || value === '')){
    errors.push(`${location}.${field} is required`);
    return;
  }
  if(value === undefined || value === null) return; // optional and absent — nothing further to check

  if(rule.type === 'string' && typeof value !== 'string'){
    errors.push(`${location}.${field} must be a string`);
  }
  if(rule.type === 'number' && Number.isNaN(Number(value))){
    errors.push(`${location}.${field} must be a number`);
  }
  if(rule.type === 'uuid' && !(typeof value === 'string' && UUID_RE.test(value))){
    errors.push(`${location}.${field} must be a valid UUID`);
  }
  if(rule.enum && !rule.enum.includes(value)){
    errors.push(`${location}.${field} must be one of: ${rule.enum.join(', ')}`);
  }
}

/**
 * validate({ body: {name:{type:'string',required:true}}, params: {id:{type:'uuid',required:true}} })
 * Throws ValidationError (caught by the central error handler) on the first
 * request that fails any rule — never lets malformed input reach a service.
 */
function validate(schema){
  return function validateMiddleware(req, res, next){
    const errors = [];
    for(const location of ['params', 'query', 'body']){
      if(!schema[location]) continue;
      const source = req[location] || {};
      for(const [field, rule] of Object.entries(schema[location])){
        validateField(location, field, source[field], rule, errors);
      }
    }
    if(errors.length){
      return next(new ValidationError('Validation failed', errors));
    }
    next();
  };
}

module.exports = { validate };
