interface SpotifyLoginSectionProps {
    isMobile: boolean
    onLogin: (user: any) => void
    spotifyUser: any
}

export default function SpotifyLoginSection({
    isMobile,
    onLogin,
    spotifyUser
}: SpotifyLoginSectionProps) {

    const handleLogin = async () => {
        // TODO: Implement Spotify OAuth
        // For now, just simulate login
        const mockUser = {
            id: 'user123',
            name: 'Test User',
            email: 'test@example.com'
        }
        onLogin(mockUser)
    }

    return (
        <div
            className={`
        relative bg-cover bg-center bg-no-repeat
        flex items-center justify-center
        ${isMobile ? 'h-full' : 'h-full'}
      `}
            style={{
                backgroundImage: "url('/Buttons/UI_Background.png')", // UI background image
                backgroundSize: '100% 100%' // Stretch to fit
            }}
        >
            {/* Login Button Image */}
            {spotifyUser ? (
                <img
                    src="/Buttons/Logged.png" // Your "logged in" button image
                    alt="Spotify Connected"
                    className={`
            ${isMobile ? 'w-[80%] h-auto' : 'w-[90%] h-[20%]'}
            cursor-pointer hover:opacity-80 transition-opacity
          `}
                />
            ) : (
                <img
                    src="/Buttons/Login.png" // Your "login" button image
                    alt="Login to Spotify"
                    onClick={handleLogin}
                    className={`
            ${isMobile ? 'w-[80%] h-auto' : 'w-[90%] h-[20%]'}
            cursor-pointer hover:opacity-80 transition-opacity
          `}
                />
            )}
        </div>
    )
}