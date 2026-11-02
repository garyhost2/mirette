# The research behind Mirette

What the literature says, what Mirette takes from it, and what is new. This was a quick review on
2 November 2026, not a systematic one.

## What the research says

**Makeup is not a solid film.** Most colour prediction treats foundation as a continuous layer, using
Kubelka-Munk theory ([Doi et al. 2005](https://consensus.app/papers/details/3b077276aaa3560bbd1ccd9cc946d987/)).
Microscopy shows separate particles over partly exposed skin. A closed-form coverage model reached a
mean CIEDE2000 of about 3 on 54 in vivo measurements from 6 people
([Park et al. 2026](https://consensus.app/papers/details/72c4b9009d4c587c9b873ae62a170528/)).
That study is small and used forearms.

**Facial contrast works across groups.** The difference between features and skin is a cross-cultural
cue in Chinese, Latin American, Black South African and Caucasian women, and cosmetics raise it
([Porcheron et al. 2017](https://consensus.app/papers/details/3ba627b30ed35fdab440c54d5e2bfce0/)).

**The same lipstick reads differently on different skin.** Impression and harmony change with skin
colour, even for the same lip colour
([Seung et al. 2020](https://consensus.app/papers/details/0e49d5e5638c51e3ac8be88c3076291c/)).
Impressions follow the colour difference between lip and skin
([Wu et al. 2024](https://consensus.app/papers/details/54392a55b9c5538c8206d1a25f1ca332/)).
Preference on the forearm did not correlate with preference on the lips
([Tian et al. 2023](https://consensus.app/papers/details/72be70becf7d5c829713cfbf177fe9b6/)),
so arm swatches may mislead.

**Beauty standards are not universal.** How skin colour relates to attractiveness differs by culture
([Lu et al. 2021](https://consensus.app/papers/details/6227446dc935554c983e6e50cd7f98c3/)).
Mirette therefore never scores a face, only how well a product fits it.

**Skin tone needs better measures than Fitzpatrick.** Individual Typology Angle can be computed from
CIELAB and maps well to the Monk scale, unlike Fitzpatrick types
([Ulrich et al. 2025](https://consensus.app/papers/details/94ff2437e4345d069f4dc669096353ac/)).

**AI makeup fails most on dark skin.** BeautyGAN, PSGAN and EleGANt showed artefacts and skin-tone drift
that were worst on Black-presenting faces
([Al-Otaibi et al. 2026](https://consensus.app/papers/details/9ddd7b1316515fd8a2ce1a14eedf4015/)).
Copying pixels from a reference also carries over its skin tone
([Mokhtari et al. 2024](https://consensus.app/papers/details/a0f27a600f845f4b99a1be2ef1fc9734/)).

**The shade gap is real.** Foundation ranges skew to light and medium tones
([Frisby 2019](https://consensus.app/papers/details/2d38405236e85b07987663c4071b1507/)).
Internal UK research reported that 9% of 343 shades suited dark skin, against 67% for lighter skin
([Kanda et al. 2015](https://consensus.app/papers/details/832f551c34ba58c0be661c4c95cf1f56/)).

**Recommenders mix rules and examples.** Earlier work joined artist knowledge with before-and-after
images ([Alashkar et al. 2017](https://consensus.app/papers/details/a0ac73f5b14e555d8da76057f715d75a/)).
It recommends a style, not a shade you can buy, and needs a labelled image set.

## What Mirette takes from it

| Finding | In the code |
|---|---|
| Partial coverage, Park et al. | \`onFaceLab\` in \`lib/suit.ts\`. The form is theirs, and our constants are estimates |
| ITA, Ulrich et al. | \`ita\` and \`depthOf\` in \`lib/color.ts\` |
| Facial contrast, Porcheron et al. | The contrast measure in \`lib/translate.ts\` |
| Lip against skin, Wu and Seung | Effects are measured against the skin, never alone |
| Artist knowledge, Alashkar et al. | The rules in \`lib/guide.ts\`, which behaviour then corrects |

## What is new

1. **Look translation.** Existing transfer copies pixels, and existing recommenders pick a style.
   Mirette stores a look as its effect on the wearer: contrast against the skin, hue and strength of
   colour. It then searches real shades for the one that gives the same effect on another skin, so the
   result is something a shopper can buy.
2. **A personal shade gap.** Each shopper sees how many catalog shades actually reach their skin.
3. **Fairness reported by skin tone.** Model quality is measured for each ITA group, not only on average.

We searched and did not find a published method like the first one. A short review cannot prove
that none exists.

## What is not proven

- Look translation has not been tested on real people. It needs a study where people judge whether
  the translated look matches the original.
- The guide's values are estimates from practice, and the coverage constants are ours.
- Park et al. measured foundation only. Mirette extends the same form to lips and cheeks.
- Shade colours come from product images, not spectrophotometry.
- The fairness and shade gap numbers come from simulated shoppers and estimated colours.
