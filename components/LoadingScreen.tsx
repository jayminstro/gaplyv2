import { Loader2, Zap, Database, User, Calendar, CheckCircle } from 'lucide-react';

interface LoadingScreenProps {
  isDataLoading?: boolean;
  userName?: string;
}

export function LoadingScreen({ isDataLoading = false, userName }: LoadingScreenProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 text-white relative overflow-hidden flex items-center justify-center">
      {/* Background blur elements */}
      <div className="absolute top-10 left-5 w-20 h-20 bg-pink-400/30 rounded-full blur-xl"></div>
      <div className="absolute top-32 right-8 w-16 h-16 bg-purple-400/20 rounded-full blur-lg"></div>
      <div className="absolute bottom-40 left-8 w-24 h-24 bg-orange-400/20 rounded-full blur-xl"></div>
      
      <div className="text-center z-10">
        {/* App Logo/Icon */}
        <div className="w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-8">
          <Zap className="w-10 h-10 text-white" />
        </div>
        
        {/* App Name */}
        <h1 className="text-3xl mb-2">Gaply</h1>
        {isDataLoading && userName ? (
          <p className="text-slate-400 text-lg mb-8">Welcome back, {userName}!</p>
        ) : (
          <p className="text-slate-400 text-lg mb-8">Smart task management and time-blocking</p>
        )}
        
        {/* Loading Animation and Status */}
        <div className="flex flex-col items-center justify-center gap-6">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-slate-600 border-t-blue-400 animate-spin"></div>
            <div className="absolute inset-0 w-12 h-12 rounded-full border-4 border-transparent border-r-purple-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
          </div>
          
          {isDataLoading ? (
            <>
              <span className="text-slate-300 animate-pulse text-center">Setting up your workspace...</span>
              
              {/* Data Loading Steps */}
              <div className="flex flex-col gap-3 text-sm text-slate-400">
                <div className="flex items-center gap-3 animate-pulse">
                  <User className="w-4 h-4 text-blue-400" />
                  <span>Loading your profile</span>
                </div>
                <div className="flex items-center gap-3 animate-pulse" style={{ animationDelay: '0.5s' }}>
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span>Fetching your tasks</span>
                </div>
                <div className="flex items-center gap-3 animate-pulse" style={{ animationDelay: '1s' }}>
                  <Calendar className="w-4 h-4 text-purple-400" />
                  <span>Syncing your schedule</span>
                </div>
                <div className="flex items-center gap-3 animate-pulse" style={{ animationDelay: '1.5s' }}>
                  <Database className="w-4 h-4 text-orange-400" />
                  <span>Preparing your dashboard</span>
                </div>
              </div>
            </>
          ) : (
            <span className="text-slate-300 animate-pulse">Loading your workspace...</span>
          )}
        </div>
      </div>
    </div>
  );
}