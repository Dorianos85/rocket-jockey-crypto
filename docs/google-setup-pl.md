# Google — konfiguracja dla Rocket Jockey

1. Otwórz https://console.cloud.google.com/ i utwórz lub wybierz projekt `Rocket Jockey`.
2. W **Google Auth Platform → Branding → Get started** ustaw nazwę `Rocket Jockey`, swój email kontaktowy i odbiorców **External**. Zapoznaj się z warunkami Google i samodzielnie zaakceptuj je, jeśli się zgadzasz.
3. W **Audience** pozostaw tryb **Testing**, dodaj swój email i email kolegi w **Test users**.
4. W **Data Access** wybierz podstawowe zakresy `openid`, `https://www.googleapis.com/auth/userinfo.email` i `https://www.googleapis.com/auth/userinfo.profile`.
5. W **Clients → Create client** wybierz **Web application**, nazwę `Rocket Jockey Web`.
6. W **Authorized JavaScript origins** wpisz `http://localhost:4173` (bez końcowego ukośnika). W **Authorized redirect URIs** wpisz dokładnie:

```
https://ipstzvsjteglrweksidw.supabase.co/auth/v1/callback
```

7. Utwórz klienta. Skopiuj **Client ID** oraz **Client Secret** bezpośrednio do odpowiednich pól w [Supabase → Google](https://supabase.com/dashboard/project/ipstzvsjteglrweksidw/auth/providers?provider=Google). Włącz **Enable Sign in with Google** i kliknij **Save**. Pozostaw wyłączone opcje pomijania nonce oraz logowania bez emaila. Nie zapisuj sekretu w repozytorium ani w wiadomości na czacie.
8. Otwórz ponownie http://localhost:4173/ i przetestuj **Sign in / Pilot profile → Google**. Po powrocie sprawdź profil, włącz Ranked run i ukończ rundę.

Adres `localhost` działa wyłącznie na komputerze, na którym uruchomiony jest serwer gry. Paczka HTML do wysłania koledze zawiera tryb offline. Wspólna gra z logowaniem wymaga opublikowania frontendowej wersji HTTPS i dodania jej origin w Google oraz adresu powrotu w Supabase. Nie zmieniaj Site URL współdzielonego projektu Supabase bez sprawdzenia pozostałych aplikacji.

Źródła: [konfiguracja ekranu zgody Google](https://developers.google.com/workspace/guides/configure-oauth-consent), [instrukcja Google OAuth w Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google).
