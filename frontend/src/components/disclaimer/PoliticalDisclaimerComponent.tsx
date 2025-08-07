interface DisclaimerProps {
    isMobile: boolean
}

export default function PoliticalDisclaimer({ isMobile }: DisclaimerProps) {
    const reasons = [
        {
            title: 'Streaming Economics',
            text: 'The "pay per stream" metric is misleading. Artists are paid from a pool system where ~65% of Spotify\'s revenue (11B+ in 2024) goes to distributors and labels, which keep around 70% and then trickle down to artists.\nWith thousands of new songs added daily (between 20k and 60k), AI-generated content increasingly dilutes this pool, reducing payments even if your streams stay constant. Streaming simply isn\'t viable for most artists. \n\nBuy music and merch; join music co-ops such as Mirlo and Subvert; go to concerts. \nJust changing streaming service won\'t help artists much.',
            link: ['https://musically.com/2020/05/05/spotify-should-pay-musicians-more-lets-talk-about-how/', 'https://consumerrights.wiki/index.php/Spotify', 'https://mirlo.space/', 'https://subvert.fm/'],
            link_names: ['Spotify paying system', 'Spotify\'s consumer rights violations', 'Mirlo', 'Subvert']
        },
        {
            title: 'AI Warfare Investment',
            text: 'The website has been created mainly to address how Spotify\'s CEO Daniel Ek\'s investment company Prima Materia has invested €1.3bn since 2021 on AI Warfare technology, specifically on Helsing. The German war-tech company states that its goal is to "protect democracies", which are completely self-determined by their own terms.\nMost musicians are paid nothing whilst Spotify keeps on accruing value, enriching those who hold its shares, and they spend it on continuation of atrocities: violence generates violence, which then generates money for rich people that are not affected by the war. \n\nFor context, I have not included in the platforms Amazon Music and Youtube Music since Google and Amazon keep a very healty relationship with Trump, thus pretty directly funding war too. Apple does it as well, but I guess taking away all the most famous streaming platforms would reduce usage by a lot.',
            link: ["https://www.removepaywall.com/search?url=https://www.ft.com/content/cdc02d96-13b5-4ca2-aa0b-1fc7568e9fa0", 'https://helsing.ai/', 'https://primamateria.com/', 'https://inthesetimes.com/article/spotify-military-industrial-complex-daniel-ek-prima-materia-helsing'],
            link_names: ['Latest investment', 'Helsing AI', "Prima Materia", "Pretty good article from 2022"]
        }
    ]

    // Function to render text with line breaks
    const renderTextWithLineBreaks = (text: string) => {
        return text.split('\n').map((line, index) => (
            <span key={index}>
                {line}
                {index < text.split('\n').length - 1 && <br />}
            </span>
        ))
    }

    return (
        <div className={`${isMobile ? 'p-4' : 'p-8'}`}>
            <div className="max-w-8xl mx-auto text-center bg-cover bg-center bg-no-repeat">
                <div style={{
                    fontSize: '11px',
                    backgroundImage: "url('/Buttons/UI_Background_Red.jpg')",
                    backgroundSize: '100% 100%',
                    padding: '3px 2px 3px 3px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    boxShadow: 'inset 1px 1px 0px rgba(255,255,255,0.3), inset -1px -1px 0px rgba(0,0,0,0.3)',
                    border: '1px solid #990000',
                }} className="mb-5">
                    <span style={{
                        fontWeight: 'bold',
                        color: 'white',
                        letterSpacing: '0',
                        fontSize: '20px'
                    }}>
                        THIS ISN'T ABOUT MUSIC TRANSFER. IT'S ABOUT UNDERSTANDING WHERE YOUR MONEY GOES.
                    </span>
                </div>

                <div className={`grid gap-6 ${isMobile ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
                    {reasons.map((reason, i) => (
                        <div key={`reason-${i}`} className="bg-cover bg-center bg-no-repeat p-6 shadow-[0px_0px_20px_0px_rgba(255,_255,_255,_0.5)]"
                            style={{
                                backgroundImage: "url('/Buttons/UI_Background_Big.png')",
                                backgroundSize: '100% 100%',
                                height: '300px'
                            }}>
                            <div className='overflow-y-scroll w-full h-full'>
                                <h2 className="text-red-600 font-semibold mb-3 mt-3">{reason.title}</h2>
                                <p className="text-white text-sm mb-4 leading-relaxed">
                                    {renderTextWithLineBreaks(reason.text)}
                                </p>
                                {reason.link[0] !== "" && reason.link.map((link, linkIndex) => (
                                    <a
                                        key={`link-${i}-${linkIndex}`}
                                        href={link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-white-600 bg-strongblue hover:text-red-400 transition-colors duration-200 cursor-pointer mr-2"
                                    >
                                        [{reason.link_names[linkIndex]}]
                                    </a>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-5 w-1/3 bg-cover bg-center bg-no-repeat ml-[50%]" style={{
                    backgroundImage: "url('/Buttons/UI_Background_Red.jpg')",
                    backgroundSize: '100% 100%',
                    padding: '3px 2px 3px 3px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    boxShadow: 'inset 1px 1px 0px rgba(255,255,255,0.3), inset -1px -1px 0px rgba(0,0,0,0.3)',
                    border: '1px solid #430101ff',
                    imageRendering: 'pixelated',
                    transform: 'translateX(-50%)'
                }}>
                    <p className="text-gray text-sm">
                        Your data stays on your device.
                    </p>
                </div>
            </div>
        </div >
    )
}