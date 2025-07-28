interface TransferButtonSectionProps {
    isMobile: boolean
    spotifyUser: any
    selectedSongs: string[]
    selectedAlbums: string[]
    selectedPlaylists: string[]
    selectedPlatform: string | null
}

export default function TransferButtonSection({
    isMobile,
    spotifyUser,
    selectedSongs,
    selectedAlbums,
    selectedPlaylists,
    selectedPlatform
}: TransferButtonSectionProps) {

    const totalSelected = selectedSongs.length + selectedAlbums.length + selectedPlaylists.length
    const canTransfer = spotifyUser && totalSelected > 0 && selectedPlatform

    const handleTransfer = async () => {
        if (!canTransfer) return

        // TODO: Implement actual transfer logic
        console.log('Transferring:', {
            songs: selectedSongs,
            albums: selectedAlbums,
            playlists: selectedPlaylists,
            to: selectedPlatform
        })

        alert(`Starting transfer of ${totalSelected} items to ${selectedPlatform}`)
    }

    return (
        <div
            className={`
        relative bg-cover bg-center bg-no-repeat
        flex items-center justify-center
        ${isMobile ? 'h-[150px]' : 'h-[100%]'}
      `}
            style={{
                backgroundImage: "url('/Buttons/UI_Background.png')", // Your UI background image
                backgroundSize: '100% 100%' // Stretch to fit
            }}
        >
            {/* Transfer Button Image */}
            <img
                src={canTransfer ? "/Buttons/Transfer.png" : "/Buttons/Transfer_Disabled.png"} // Different buttons for active/disabled state
                alt="Transfer"
                onClick={handleTransfer}
                className={`
          ${isMobile ? 'w-[80%] h-auto' : 'w-[90%] h-auto'}
          ${canTransfer
                        ? 'cursor-pointer hover:opacity-80 hover:scale-105 transition-all'
                        : 'cursor-not-allowed'
                    }
        `}
            />
        </div>
    )
}