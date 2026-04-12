# IntelliDocs Progress Summary

**Last Updated:** Current Thread  
**Phase:** Phase 1 — Foundation (Steps 1-5)  
**Status:** Auth System ✅ Complete. Next: Custom contentEditable Editor

---

## ✅ Completed

### Backend (Express + Supabase)
- ✅ **Supabase setup** — Database + Auth configured
- ✅ **Document CRUD** — All operations in models + controllers (MVC strict)
- ✅ **Auth routes** — Login/Register working with Supabase
- ✅ **Auth middleware** — Protects `/documents` routes with JWT verification
- ✅ **Type safety** — All interfaces properly typed (Document, User, etc.)

### Frontend (React + Vite)
- ✅ **AuthContext** — Global auth state management (`user`, `token`, `loading`, `isAuthenticated`)
- ✅ **useAuth hook** — Easy access to auth state anywhere in app
- ✅ **ProtectedRoute component** — Wraps pages requiring authentication
- ✅ **Login page** — Sets auth context after successful login
- ✅ **Register page** — Auto-logs in user after registration
- ✅ **Token persistence** — localStorage restores token on page refresh
- ✅ **Protected routes** — Unauthenticated users redirected to `/login`
- ✅ **Protected API calls** — Token automatically sent in `Authorization` header

### Testing Complete
- ✅ Backend: Unauthenticated requests to `/documents` return 401
- ✅ Backend: Valid token requests succeed and return user's documents
- ✅ Frontend: Registration flow → auto-login → redirect to home
- ✅ Frontend: Page refresh → token restored → stay logged in
- ✅ Frontend: Manual navigation to `/login` when authenticated → redirected to home

---

## 📁 File Structure

```
frontend/src/
├── context/
│   └── AuthContext.tsx          ← Global auth state + login/logout
├── hooks/
│   └── useAuth.ts               ← Hook to access auth context
├── components/
│   └── ProtectedRoute.tsx        ← Guards protected pages
├── pages/
│   ├── Login.tsx                ← Uses useAuth().login()
│   ├── Register.tsx             ← Uses useAuth().login() + auto-login
│   ├── Home.tsx                 ← Protected route
│   └── Document.tsx             ← Protected route
├── services/
│   └── api.ts                   ← LoginResponse/RegisterResponse types fixed
└── App.tsx                      ← Wrapped with AuthProvider

server/src/
├── middleware/
│   └── authMiddleware.ts        ← JWT verification (applied to /documents)
├── controllers/
│   ├── authController.ts        ← Login/Register handlers
│   └── documentController.ts    ← Document CRUD (requires auth)
├── models/
│   └── documentModel.ts         ← Supabase queries
├── routes/
│   ├── authRoutes.ts            ← /auth/login, /auth/register (unprotected)
│   └── documentRoutes.ts        ← /documents/* (protected)
└── index.ts                     ← Middleware applied: app.use('/documents', authMiddleware, documentRoutes)
```

---

## 🔄 Auth Flow (How It Works)

### Registration → Auto-Login
```
1. User fills form → clicks "Create account"
2. Register.tsx calls api.auth.register(email, password)
3. Backend creates user in Supabase
4. Register.tsx calls api.auth.login(email, password)
5. Backend returns { user, session.access_token }
6. Register.tsx calls context.login(user, token)
7. AuthContext sets user + token, saves to localStorage
8. ProtectedRoute allows access
9. Redirect to "/" (home page)
```

### Subsequent Visits (Token Restore)
```
1. User visits http://localhost:5173
2. AuthContext useEffect runs on app load
3. Checks localStorage.getItem('authToken')
4. If found, setToken(savedToken)
5. ProtectedRoute checks isAuthenticated (!!token)
6. User stays logged in without re-entering credentials
```

### API Requests
```
1. Every api.ts fetch() call checks localStorage for token
2. If token exists, adds: Authorization: Bearer <token>
3. Express authMiddleware verifies token with Supabase
4. If valid, attaches req.user and calls next()
5. If invalid/missing, returns 401
```

---

## ⚙️ Key Implementation Details

### AuthContext Login Function
```typescript
const login = (userData: { id: string; email: string }, authToken: string) => {
  setUser(userData)                           // Store user data
  setToken(authToken)                         // Store token
  localStorage.setItem('authToken', authToken) // Persist across refreshes
}
```

### Backend Middleware Protection
In `server/src/index.ts`:
```typescript
app.use('/documents', authMiddleware, documentRoutes)
// authMiddleware verifies JWT, then passes to documentRoutes
```

### Frontend Protected Routes
In `App.tsx`:
```typescript
<Route path="/document/:id" element={
  <ProtectedRoute>
    <Document />
  </ProtectedRoute>
} />
// If !isAuthenticated → redirect to /login
// If loading → show "Loading..."
// If authenticated → render Document page
```

---

## 🐛 Known Issues

1. **Supabase Email Rate Limit** — Hit after 3+ registrations in short time
   - **Solution:** Use different test emails (test1@, test2@, test3@)
   - **Dev Fix:** Disable email verification in Supabase dashboard

2. **No Logout Button Yet** — Auth context has logout() but no UI button
   - **Next Step:** Add logout button to Home.tsx or navbar

---

## 🚀 Next Steps (Phase 1, Step 5)

Build the custom contentEditable editor:

### 1. Create Editor Components
```
frontend/src/components/editor/
├── EditorCore.tsx          ← contentEditable div + event handlers
├── Toolbar.tsx             ← B, I, U, H1, H2, H3 buttons
├── SelectionManager.ts     ← Handles text selection
└── FormattingCommands.ts   ← Applies formatting (bold, italic, etc.)
```

### 2. Wire into Document Page
- Replace placeholder toolbar with real Toolbar.tsx
- Replace placeholder editor div with EditorCore.tsx
- Connect toolbar buttons to FormattingCommands

### 3. Test Basic Formatting
- Select text → click Bold → text becomes bold
- Similar for Italic, Underline, Headings

---

## 📋 Checklist for Next Thread

- [ ] Verify backend auth middleware still working (test /documents endpoint)
- [ ] Verify frontend auth context restores token on refresh
- [ ] Build EditorCore.tsx with contentEditable div
- [ ] Build Toolbar.tsx with formatting buttons
- [ ] Build FormattingCommands.ts for formatting logic
- [ ] Connect toolbar to editor on Document page
- [ ] Test basic text formatting (bold, italic)

---

## 🔗 Related Documentation

- **AGENTS.md** — Full tech stack and architecture rules
- **README.md** — Project overview and quick start
- **MVC Architecture** — Strict separation in AGENTS.md (never break this)
- **Build Order** — Phases 1-8 in AGENTS.md

---

## 👤 Team Notes

- Always use `useAuth()` hook to access auth state, never access context directly
- Keep auth logic out of pages — call context functions only
- Backend: Route → Controller → Model (never skip layers)
- All API responses must be typed (use TypeScript interfaces)
- No `any` types allowed