#!/usr/bin/env python3

from obspy.imaging.beachball import beachball

strike = 55
dip = 80
rake = 12

beachball(
    [strike, dip, rake],
    outfile="beachball.png",
    width=300,
    alpha=1,
    facecolor="#f51441",
    format="png",
    linewidth=3
)


print("Created beachball.png")
