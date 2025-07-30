import { useState, useEffect } from 'react'

interface PlatformSelectorSectionProps {
    isMobile: boolean
    selectedPlatform: string | null
    onSelectPlatform: (platform: string | null) => void
}

export default function PlatformSelectorSection({
    isMobile,
    selectedPlatform,
    onSelectPlatform
}: PlatformSelectorSectionProps) {
    const [isCheckingTidalAuth, setIsCheckingTidalAuth] = useState(true)
    const [isTidalLoggedIn, setIsTidalLoggedIn] = useState(false);
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const platforms = [
        { name: 'APPLE MUSIC', image: '/Buttons/Apple.png', implemented: false },
        { name: 'SOUNDCLOUD', image: '/Buttons/Soundcloud.png', implemented: false },
        { name: 'TIDAL', image: '/Buttons/Tidal.png', implemented: true },
        { name: 'YOUTUBE MUSIC', image: '/Buttons/YT.png', implemented: false },
        { name: 'BANDCAMP', image: '/Buttons/Bandcamp.png', implemented: true }
    ]

    const handleTidalLogin = async () => {
        setIsLoggingIn(true);
        try {
            // 1. Get the login URL from our backend
            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/tidal/initiate-login`);
            const { login_url, poll_key } = await res.json();

            // 2. Open the login page for the user
            const width = 600;
            const height = 700;
            const left = (window.screen.width / 2) - (width / 2);
            const top = (window.screen.height / 2) - (height / 2);
            const features = `width=${width},height=${height},top=${top},left=${left}`;

            window.open(login_url, 'TidalLogin', features);

            // 3. Poll our backend to see if the user has finished
            const pollInterval = setInterval(async () => {
                const verifyRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/tidal/verify-login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ poll_key: poll_key }),
                });
                const verifyData = await verifyRes.json();

                if (verifyData.status === 'completed') {
                    clearInterval(pollInterval);
                    localStorage.setItem('tidal_access_token', verifyData.access_token);
                    setIsTidalLoggedIn(true);
                    setIsLoggingIn(false);
                    onSelectPlatform('TIDAL');
                }
            }, 3000);

        } catch (error) {
            console.error("Tidal login failed", error);
            alert("Tidal login failed. Please try again.");
            setIsLoggingIn(false);
        }
    };

    const handleTidalLogout = async () => {
        localStorage.removeItem('tidal_access_token');
        setIsTidalLoggedIn(false);
        onSelectPlatform(null);
    };

    // On component load, check if we already have a token in localStorage
    useEffect(() => {
        const token = localStorage.getItem('tidal_access_token');
        if (token) {
            setIsTidalLoggedIn(true);
        }
    }, []);

    const handlePlatformClick = async (platformName: string) => {
        if (platformName === 'TIDAL' && !isTidalLoggedIn) {
            handleTidalLogin();
            return; // Don't select the platform until login is complete
        } else if (!platforms.find(p => p.name === platformName)?.implemented) {
            // Platform not implemented yet
            alert(`${platformName} integration coming soon!`)
            return
        }
        onSelectPlatform(platformName)
    }

    return (
        <div
            className={`
        relative bg-cover bg-center bg-no-repeat flex flex-col items-center justify-center p-4
        ${isMobile ? 'h-[300px]' : 'h-[100%]'}
      `}
            style={{
                backgroundImage: "url('/Buttons/UI_Background.png')",
                backgroundSize: '100% 100%'
            }}
        >
            {/* Platform buttons */}
            <div className="flex-1 flex flex-col justify-center space-y-2 w-full">
                {platforms.map((platform) => {
                    const isSelected = selectedPlatform === platform.name;
                    const isTidal = platform.name === 'TIDAL';

                    // --- Define dynamic properties for the Tidal button ---
                    let imageSrc = platform.image;
                    let onClickAction = () => handlePlatformClick(platform.name);
                    let titleText = platform.implemented ? `Select ${platform.name}` : `${platform.name} - Coming Soon`;
                    let isDisabled = !platform.implemented || (isTidal && isLoggingIn);

                    if (isTidal) {
                        if (isLoggingIn) {
                            titleText = 'Waiting for authorization in other tab...';
                        } else if (isTidalLoggedIn) {
                            imageSrc = '/Buttons/Tidal_Logout.png';
                            onClickAction = handleTidalLogout;
                            titleText = 'Logged in to Tidal. Click to logout.';
                        } else {
                            // State: Not logged in, ready to start
                            titleText = 'Click to login to Tidal';
                        }
                    }

                    return (
                        <div key={platform.name} className="relative">
                            <img
                                src={imageSrc}
                                alt={platform.name}
                                onClick={isDisabled ? undefined : onClickAction}
                                className={`
                                    w-full h-auto transition-all
                                    ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                    ${isSelected
                                        ? 'brightness-125 scale-105'
                                        : platform.implemented
                                            ? 'hover:brightness-110 hover:scale-102'
                                            : ''
                                    }
                                    ${isMobile ? 'max-h-9' : 'max-h-10'}
                                `}
                                title={titleText}
                            />

                            {/* Coming soon indicator for unimplemented platforms */}
                            {!platform.implemented && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-xs text-white bg-black bg-opacity-75 px-1 rounded">
                                        Soon
                                    </span>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Remove the separate logout button if you wish, as it's now handled by the main Tidal button */}

            {/* Status indicator can be removed or kept, as the button itself now shows the loading state */}
            {isCheckingTidalAuth && (
                <div className="absolute bottom-2 right-2">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                </div>
            )}
        </div>
    )
}