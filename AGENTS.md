# AGENTS.md - Guidelines for Sonic Development

This file provides essential information for AI agents working on the Sonic codebase, a Bilibili audio player built with Expo and React Native.

## Build & Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm start          # or: npx expo start

# Platform-specific development
npm run android    # Start with Android emulator
npm run ios        # Start with iOS simulator
npm run web        # Start web version

# Linting
npm run lint       # Run ESLint with expo config

# Reset project (moves starter code to app-example)
npm run reset-project
```

**Note**: This project uses **pnpm** as the package manager (see `pnpm-lock.yaml`). Prefer `pnpm install` when possible.

## Technology Stack

- **Framework**: Expo SDK ~54.0.33 with Expo Router v6
- **React**: React Native 0.81.5, React 19.1.0
- **Language**: TypeScript 5.9.2 (strict mode enabled)
- **Package Manager**: pnpm
- **Linting**: ESLint 9.x with `eslint-config-expo`
- **Navigation**: Expo Router (file-based routing)
- **State Management**: React Context API + custom PlayerStore
- **Storage**: @react-native-async-storage/async-storage
- **Audio**: expo-audio, expo-av
- **Styling**: React Native StyleSheet (no CSS-in-JS)

## Project Structure

```
app/                    # Expo Router file-based routes
├── (tabs)/            # Tab group routes
│   ├── index.tsx      # Main parse screen
│   ├── player.tsx     # Audio player screen
│   └── settings.tsx   # Settings screen
├── _layout.tsx        # Root layout with providers
└── modal.tsx          # Modal screen

src/
├── components/        # Reusable components (ToastConfig, etc.)
├── context/           # React Context providers
│   └── PlayerContext.tsx
├── services/          # Business logic & API calls
│   ├── bilibili.ts    # Bilibili API integration
│   ├── scraper.ts     # Web scraping fallback
│   ├── download.ts    # File download management
│   └── PlayerStore.ts # Audio player state management
├── storage/           # AsyncStorage utilities
│   └── queueStorage.ts
├── types/             # TypeScript type definitions
│   └── index.ts
└── utils/             # Utility functions
    └── parser.ts      # BV number parser

components/            # Expo default components
├── ui/               # UI components (IconSymbol, Collapsible, etc.)
├── themed-text.tsx   # Theme-aware Text component
├── themed-view.tsx   # Theme-aware View component
└── ...

hooks/                 # Custom React hooks
constants/             # App constants (theme.ts)
assets/                # Static assets (images, fonts)
```

## Code Style Guidelines

### TypeScript & Types

- **Strict mode is enabled** - all code must pass strict TypeScript checks
- Use explicit return types on exported functions
- Prefer `interface` over `type` for object shapes
- Use `undefined` instead of `null` where possible
- Example:
  ```typescript
  export interface VideoInfo {
    bvid: string;
    title: string;
    pages: Part[];
  }
  
  export async function getVideoInfo(bvid: string): Promise<ParseResult> {
    // implementation
  }
  ```

### Naming Conventions

- **Components**: PascalCase (e.g., `PlayerContext`, `ParseScreen`)
- **Hooks**: camelCase starting with "use" (e.g., `usePlayer`, `useNetworkStatus`)
- **Types/Interfaces**: PascalCase (e.g., `VideoInfo`, `QueuedTrack`)
- **Constants**: UPPER_SNAKE_CASE for true constants (e.g., `BILIBILI_REFERER`)
- **Files**: camelCase or PascalCase matching default export
- **Boolean props**: Use positive naming (e.g., `isLoading` not `isNotLoading`)

### Imports

- **Path alias**: Use `@/` for imports from project root
  ```typescript
  import { useColorScheme } from '@/hooks/use-color-scheme';
  import { PlayerProvider } from '@/src/context/PlayerContext';
  ```
- **Relative imports**: Use for files within same directory or nearby
  ```typescript
  import { parseInput } from '../../src/utils/parser';
  import { VideoInfo } from '../types';
  ```
- **External libraries**: Group at top, separate from local imports with blank line
- **React imports**: Always import hooks explicitly
  ```typescript
  import { useState, useEffect, useCallback } from 'react';
  ```

### Component Structure

- Use function components with explicit return types when needed
- Destructure props in function parameters
- Place styles at bottom of file using `StyleSheet.create()`
- Keep components focused and single-responsibility
- Example:
  ```typescript
  interface Props {
    bvid: string;
    onParse: (result: ParseResult) => void;
  }
  
  export function ParseInput({ bvid, onParse }: Props) {
    const [isLoading, setIsLoading] = useState(false);
    
    // component logic...
    
    return (
      <View style={styles.container}>
        {/* JSX */}
      </View>
    );
  }
  
  const styles = StyleSheet.create({
    container: { flex: 1, padding: 16 }
  });
  ```

### Error Handling

- Always wrap async operations in try-catch blocks
- Return structured error objects instead of throwing:
  ```typescript
  return {
    success: false,
    error: error instanceof Error ? error.message : 'Unknown error'
  };
  ```
- Use pattern: `{ success: boolean; data?: T; error?: string }`
- Log errors with console.log/console.error for debugging
- Show user-friendly messages via Toast

### State Management

- **Local state**: useState for component-specific state
- **Global state**: PlayerContext for app-wide state (queue, current track, player status)
- **Player state**: Managed via PlayerStore (observer pattern with subscribe/unsubscribe)
- **Storage**: AsyncStorage for persistence (queue, downloaded files)
- Prefer `useCallback` for functions passed to child components
- Use `useMemo` for expensive computations

### React Native Specific

- Use React Native components (View, Text, TouchableOpacity, etc.)
- Use `SafeAreaView` from `react-native-safe-area-context` for root containers
- Handle platform differences explicitly when needed
- Use `StyleSheet.create()` for all styles (no inline styles)
- Colors: Use hex codes consistently (e.g., `#3B82F6` for primary blue)
- Touch targets: Minimum 44x44 for accessibility

### API & Network

- Always include Referer header for Bilibili API calls:
  ```typescript
  headers: {
    'Referer': 'https://www.bilibili.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
  ```
- Handle network errors gracefully with fallback to web scraping
- Use console.log for API response debugging
- Prefer `fetch` over axios (already used throughout codebase)

### Comments

- Use Chinese comments for business logic (existing convention)
- Use English for technical/algorithmic comments
- Keep comments concise and meaningful
- Example:
  ```typescript
  // 获取视频信息以获取标题和作者
  const videoResult = await getVideoInfo(parsedResult.bvid);
  ```

### Testing

- No formal test framework is configured
- Test scripts in `/scripts/` folder for manual testing
- Use `test-scraper.js` for testing scraper functionality

## Key Patterns

### Context Provider Pattern
```typescript
const MyContext = createContext<MyContextType | undefined>(undefined);

export function MyProvider({ children }: { children: ReactNode }) {
  // state and logic
  return (
    <MyContext.Provider value={value}>
      {children}
    </MyContext.Provider>
  );
}

export function useMyContext(): MyContextType {
  const context = useContext(MyContext);
  if (!context) throw new Error('useMyContext must be used within MyProvider');
  return context;
}
```

### Async Operation Pattern
```typescript
const [isLoading, setIsLoading] = useState(false);

const handleOperation = async () => {
  setIsLoading(true);
  try {
    const result = await fetchData();
    // handle success
  } catch (error) {
    // handle error
  } finally {
    setIsLoading(false);
  }
};
```

## Audio System (expo-audio)

- **Use expo-audio** for all audio operations, not expo-av's Audio component
- PlayerStore manages audio state via expo-audio API
- Audio URLs must include proper headers (Referer) for Bilibili
- Support for both streaming and local file playback
- Handle audio interruptions (calls, notifications) gracefully

## File Operations

- **Use the new FileSystem API** (expo-file-system ~19.0.21)
- Do not use deprecated/old FileSystem methods
- Download directory: `${FileSystem.documentDirectory}downloads/`
- File naming: `{cid}_{page}.m4a` format for downloaded tracks
- Check file existence before playback to fallback to streaming

## Architecture Principles

- **Modular design**: Each module has single responsibility
- **High cohesion**: Related functionality grouped together
- **Low coupling**: Modules communicate via well-defined interfaces
- **Service layer**: All API calls isolated in `src/services/`
- **Context layer**: State management separated from UI
- **Utils**: Pure functions in `src/utils/`
- **Types**: Shared types in `src/types/index.ts`

## Important Notes

- **No automated tests** are configured - manual testing required
- **Download functionality** uses FileSystem API with specific naming convention
- **Track identification**: Uses `bvid_page` format for track IDs
- **Repeat modes**: off, all, one, shuffle
- **Platform support**: iOS, Android, Web (via React Native Web)
- **Bundle output**: Built files go to `dist/` directory

## Common Pitfalls

1. Don't forget to add new routes to the Stack in `app/_layout.tsx`
2. Always check for `null`/`undefined` before accessing currentTrack properties
3. PlayerStore state changes are asynchronous - don't assume immediate updates
4. Bilibili API requires proper headers (Referer, User-Agent)
5. File paths should use Expo FileSystem constants, not hardcoded paths
6. Remember to unsubscribe from PlayerStore in useEffect cleanup
7. Use expo-audio, not expo-av's Audio for new audio features
8. Keep modules decoupled - don't import UI components into services
