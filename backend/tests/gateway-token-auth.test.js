import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { authenticate, requireUser, requireAdmin } from '../src/gateway/middleware.js';
import { config } from '../src/config/env.js';

function response() { return { statusCode: 200, body:null, status(code){this.statusCode=code;return this;}, json(body){this.body=body;return this;} }; }
function token(claims={}) { return jwt.sign({sub:'user-1',email:'u@example.edu',fullName:'User',accountType:'TEACHER',isAdmin:false,active:true,authVersion:1,...claims},config.jwtSecret,{issuer:config.jwtIssuer,audience:config.jwtAudience,expiresIn:'1m'}); }

test('authorizes a valid signed token without calling Auth service', async () => {
  const req={headers:{authorization:`Bearer ${token()}`}}; const res=response(); let nexted=false;
  await authenticate(req,res,()=>{nexted=true;});
  assert.equal(nexted,true); assert.equal(req.auth.userId,'user-1'); assert.equal(req.user.accountType,'TEACHER');
  requireUser(['TEACHER'])(req,res,()=>{nexted='role-ok';}); assert.equal(nexted,'role-ok');
});
test('rejects tokens without signed authorization claims', async () => {
  const req={headers:{authorization:`Bearer ${jwt.sign({sub:'user-1'},config.jwtSecret,{issuer:config.jwtIssuer,audience:config.jwtAudience})}`}}; const res=response();
  await authenticate(req,res,()=>assert.fail('next must not run'));
  assert.equal(res.statusCode,401);
});
test('requires the signed admin claim for administrative routes', async () => {
  const req={user:{is_admin:false}}; const res=response();
  requireAdmin(req,res,()=>assert.fail('next must not run'));
  assert.equal(res.statusCode,403);
});
