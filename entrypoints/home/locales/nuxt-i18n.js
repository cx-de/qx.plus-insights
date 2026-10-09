import en from '~/locales/en.json'
import de from '~/locales/de.json'
import nl from '~/locales/nl.json'
import pl from '~/locales/pl.json'

export default defineI18nConfig(() => {
    return {
        legacy: false,
        locale: 'de',
        messages: {
            en,
            de,
            nl,
            pl
        }
    }
})