# Myles' Playground

A comprehensive **productivity and collaboration application** built with React, TypeScript, and modern web technologies. Features real-time collaboration, video calling, task management, focus tools, and more.

## 🌟 Features

### 📊 **Dashboard (/now)**
- **Dynamic backgrounds** from Unsplash
- **Live weather** with location detection
- **Daily inspirational quotes**
- **Customizable settings** with dark/light themes
- **Smart caching** for performance

### 📅 **Event Planning (/next)**
- **Event creation and management**
- **Calendar integration** with React Day Picker
- **Filter by timeframes** (today, this week, month, etc.)
- **Recurring event support**
- **Priority levels** and categories

### ⏱️ **Focus Timer (/focus)**
- **Pomodoro technique** implementation
- **Customizable work/break intervals**
- **Session tracking** and statistics
- **Background sound effects**
- **Goal setting** and achievements

### 🎨 **Collaborative Canvas (/canvas)**
- **Real-time collaborative drawing**
- **Multiple tools** (brush, eraser, shapes)
- **Live cursor tracking** between users
- **Stroke synchronization** via Supabase
- **Mobile touch** optimized drawing
- **Canvas export** functionality

### 📝 **Notes (/notes)**
- **Rich note-taking** with Markdown support
- **Drag & drop organization** via DnD Kit
- **Search and filter** capabilities
- **Statistics** and quick actions
- **Local storage** persistence
- **Export functionality**

### 📹 **Video Calling (/video)**
- **HD video conferencing** via Whereby
- **Device selection** (camera, microphone, speaker)
- **Real-time device switching**
- **Screen sharing capabilities**
- **Mobile optimized** interface

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS, Framer Motion
- **State Management**: Zustand
- **Routing**: React Router DOM
- **Database**: Supabase (PostgreSQL)
- **Real-time**: Supabase Realtime + PartyKit
- **Video**: Whereby Browser SDK
- **Deployment**: Netlify

## 📋 Prerequisites

- **Node.js** 18.20.8+ (LTS recommended)
- **npm** 10.8.2+
- **Supabase** account and project
- **Whereby** account and API key
- **Unsplash** API access (optional, has fallbacks)

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone <repository-url>
cd playground
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
Copy the example environment file:
```bash
cp env.example .env
```

Edit `.env` with your API keys:
```env
# Whereby API Configuration
VITE_WHEREBY_API_KEY=your_whereby_api_key_here

# Unsplash API Configuration (optional)
VITE_UNSPLASH_KEY=your_unsplash_access_key_here

# Default Whereby Room URL
VITE_DEFAULT_ROOM_URL=https://yourdomain.whereby.com/your-room-name 

# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_KEY=your_anon_public_key_here
```

### 4. Database Setup
1. Create a new **Supabase project**
2. Go to **SQL Editor** in your Supabase dashboard
3. Run the SQL script from `supabase-schema.sql`
4. Ensure **Real-time** is enabled for the tables

### 5. Run Development Server
```bash
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173)

## 🔧 API Configuration

### Supabase Setup
1. Create account at [supabase.com](https://supabase.com)
2. Create new project
3. Get your project URL and anon key from **Settings > API**
4. Run the SQL schema from `supabase-schema.sql`
5. Enable **Real-time** for `canvas_strokes` and `canvas_cursors` tables

### Whereby API
1. Sign up at [whereby.com](https://whereby.com)
2. Get API key from **Developer Console**
3. Create rooms via their API or dashboard
4. Add your room URL to environment variables

### Unsplash API (Optional)
1. Create developer account at [unsplash.com/developers](https://unsplash.com/developers)
2. Create new application
3. Get your **Access Key**
4. Note: App has fallback images if API is unavailable

## 📁 Project Structure

```
playground/
├── src/
│   ├── components/          # Reusable UI components
│   │   └── video/          # Video calling components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # External service integrations
│   │   ├── supabase.ts     # Supabase client setup
│   │   ├── wherebyService.ts # Whereby integration
│   │   └── canvasService.ts # Canvas collaboration
│   ├── routes/             # Main application routes
│   │   ├── Now.tsx         # Dashboard
│   │   ├── Next.tsx        # Event planning
│   │   ├── Focus.tsx       # Pomodoro timer
│   │   ├── Canvas.tsx      # Collaborative drawing
│   │   ├── Notes.tsx       # Note-taking
│   │   └── Video.tsx       # Video calling
│   ├── state/              # Zustand stores
│   │   ├── canvas.ts       # Canvas state
│   │   ├── events.ts       # Events state
│   │   ├── focus.ts        # Focus timer state
│   │   └── notes.ts        # Notes state
│   └── App.tsx             # Main application component
├── party/                  # PartyKit real-time server
│   └── server.ts           # WebSocket collaboration server
├── public/                 # Static assets
├── supabase-schema.sql     # Database schema
├── netlify.toml           # Deployment configuration
└── package.json           # Dependencies and scripts
```

## 🎨 Key Features Deep Dive

### Real-time Collaboration
- **Canvas drawing** syncs across all users in real-time
- **Cursor tracking** shows other users' positions
- **Efficient updates** with throttling for performance
- **Conflict resolution** for simultaneous edits

### Mobile Optimization
- **Touch-friendly** canvas drawing
- **Responsive design** for all screen sizes
- **Optimized performance** for mobile devices
- **PWA capabilities** with proper meta tags

### Performance Features
- **Smart caching** for API responses
- **Throttled updates** for real-time features
- **Optimized state management** with Zustand
- **Efficient re-renders** with React 19 features

## 🚀 Available Scripts

```bash
# Development
npm run dev              # Start development server

# Building
npm run build           # Production build with TypeScript check
npm run build:fallback  # Alternative build method
npm run preview         # Preview production build

# Code Quality
npm run lint            # Run ESLint
```

## 🌐 Deployment

### Netlify (Recommended)
1. Connect your GitHub repository to Netlify
2. Set environment variables in Netlify dashboard
3. Deploy automatically on push to main branch

**Build settings:**
- **Build command**: `./netlify-build.sh`
- **Publish directory**: `dist`
- **Node version**: `18.20.8`

### Environment Variables for Production
Set these in your deployment platform:
```
VITE_WHEREBY_API_KEY=your_production_key
VITE_UNSPLASH_KEY=your_production_key
VITE_DEFAULT_ROOM_URL=your_production_room_url
VITE_SUPABASE_URL=your_production_supabase_url
VITE_SUPABASE_KEY=your_production_supabase_key
```

## 🔒 Security Configuration

The app includes comprehensive security headers via `netlify.toml`:

- **Content Security Policy** for external API access
- **Permissions Policy** for camera/microphone access
- **XSS Protection** and other security headers
- **CORS configuration** for all required domains

## 🐛 Troubleshooting

### Common Issues

**Build failures on Netlify:**
- Use the custom `netlify-build.sh` script
- Check that all environment variables are set
- Try the fallback build command if needed

**Supabase connection issues:**
- Verify your project URL and anon key
- Check that RLS policies are properly set
- Ensure real-time is enabled for required tables

**Video calling not working:**
- Verify Whereby API key and room URL
- Check browser permissions for camera/microphone
- Ensure HTTPS connection (required for media access)

**Canvas collaboration issues:**
- Check Supabase real-time connection
- Verify database schema is properly applied
- Check browser console for WebSocket errors

## 📚 Development Guidelines

### Code Style
- **TypeScript** for type safety
- **ESLint** for code quality
- **Prettier** for formatting
- **Component-based** architecture

### State Management
- **Zustand** for global state
- **Local state** for component-specific data
- **Persistent storage** for user preferences

### Performance Best Practices
- **Throttled updates** for real-time features
- **Memoized components** where appropriate
- **Lazy loading** for route components
- **Optimized images** and assets

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes
4. **Test** thoroughly
5. **Submit** a pull request

## 📄 License

This project is private and proprietary.

## 🙋‍♂️ Support

For issues and questions:
- Check the troubleshooting section above
- Review the project documentation
- Check browser developer console for errors
- Verify all environment variables are correctly set

---

**Built with ❤️ using modern web technologies**
