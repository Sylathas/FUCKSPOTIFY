interface ArrowsComponentProps {
    isMobile: boolean
}

export default function ArrowsComponent({ isMobile }: ArrowsComponentProps) {
    return (
        <img
            src="/Arrows.png"
            alt="Arrows"
            className={`
        absolute z-10
        ${isMobile
                    ? 'w-40 h-40 top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2'
                    : 'w-3/4 h-1/8 top-1/8 left-1/2 transform -translate-x-1/2 -translate-y-1/2'
                }
      `}
        // Ready for animations - you can add wiggle class later
        />
    )
}