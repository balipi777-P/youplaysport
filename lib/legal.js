/* Textes légaux de la version pilote (fournis par l'éditeur). Les [CROCHETS] sont
   volontairement laissés tels quels : ils seront complétés par l'éditeur.
   Blocs : {p}, {ul:[...]}, {table:[[en-têtes],[ligne]...]}, {note}. **gras** et *italique* simples. */

export const LEGAL_MENTIONS = {
  title: 'Mentions légales',
  sections: [
    { h: 'Éditeur du site et de l’application', items: [
      { p: '[Nom / raison sociale], [statut juridique], [adresse], [e-mail de contact], [SIRET si existant].' },
    ] },
    { h: 'Directeur de la publication', items: [{ p: '[Nom de Pierre].' }] },
    { h: 'Contact', items: [{ p: '[contact@youplaysport.app].' }] },
    { h: 'Hébergement', items: [{ ul: [
      'Application web : Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis — vercel.com. [Fonctions serveur exécutées à Washington D.C. (États-Unis) à la date de rédaction ; migration vers Paris recommandée.]',
      'Base de données : Supabase (infrastructure située à Paris, France), supabase.com.',
      'Envoi d’e-mails : Resend (resend.com).',
    ] }] },
    { h: 'Propriété intellectuelle', items: [
      { p: 'La marque, le logo, les textes, la charte et le code de YouPlaySport appartiennent à l’éditeur. Toute reproduction sans autorisation est interdite.' },
    ] },
    { h: 'Version pilote', items: [
      { p: 'L’application est actuellement proposée en version pilote, à titre gratuit, à un nombre limité de clubs.' },
    ] },
  ],
};

export const LEGAL_CGU = {
  title: 'Conditions générales d’utilisation',
  updated: 'Dernière mise à jour : [date].',
  sections: [
    { h: '1. Objet', items: [{ p: 'YouPlaySport est une application web qui aide les clubs sportifs à communiquer avec les familles : séances, compétences validées, convocations, présences. Les présentes conditions encadrent son utilisation.' }] },
    { h: '2. Version pilote, gratuité', items: [{ p: 'Pendant la phase pilote, l’application est **gratuite**. Elle est mise à disposition « en l’état », sans garantie de disponibilité continue. Des fonctionnalités peuvent évoluer ou être modifiées. Si une offre payante est un jour proposée, elle ne s’appliquera qu’après information claire et acceptation du club.' }] },
    { h: '3. Comptes', items: [{ ul: [
      'Un seul compte par personne, avec une adresse e-mail valide et un mot de passe personnel. Vous êtes responsable de la confidentialité de votre mot de passe.',
      'Les administrateurs de club créent leur club et invitent les coachs et les familles par code ou lien d’invitation.',
      'Un parent ou tuteur légal crée le compte et rattache son ou ses enfants. **Un enfant mineur ne crée pas de compte de lui-même** ; l’accès autonome est réservé aux athlètes de **16 ans et plus**, avec les droits décrits dans l’application.',
      'Le rattachement d’un enfant à un club est **validé par le coach de son groupe ou, à défaut, par l’administrateur du club**. Il peut être refusé.',
    ] }] },
    { h: '4. Règles d’usage', items: [{ p: 'Vous vous engagez à : fournir des informations exactes ; ne pas usurper une identité ; ne pas tenter d’accéder aux données d’un autre club ou d’une autre famille ; ne pas perturber le service ; respecter un ton bienveillant (l’application ne comporte ni notes, ni classements, ni commentaires négatifs sur les enfants). Les coachs et dirigeants s’engagent à ne publier que des informations utiles à l’activité sportive.' }] },
    { h: '5. Rôle du club', items: [{ p: 'Chaque club décide qui il invite et valide les rattachements. Le club est responsable de l’usage qu’il fait de l’application avec ses membres et ses licenciés. YouPlaySport met à disposition l’outil et héberge les données selon la politique de confidentialité.' }] },
    { h: '6. Données personnelles', items: [{ p: 'Le traitement des données est décrit dans la [[politique de confidentialité]]. Vous pouvez exporter vos données et supprimer votre compte depuis l’application.' }] },
    { h: '7. Suspension', items: [{ p: 'L’éditeur peut suspendre un compte ou un club en cas d’usage contraire aux présentes conditions ou de risque pour la sécurité, après information lorsque c’est possible.' }] },
    { h: '8. Responsabilité', items: [{ p: 'L’éditeur met en œuvre des moyens raisonnables pour assurer le fonctionnement et la sécurité de l’application, sans garantir l’absence d’interruption ou d’erreur. L’application ne remplace ni l’encadrement sportif ni les obligations du club (assurance, licences, sécurité des activités). L’éditeur n’est pas responsable des décisions prises par les clubs à partir des informations de l’application.' }] },
    { h: '9. Évolution des conditions', items: [{ p: 'Les conditions peuvent être mises à jour. Les utilisateurs en seront informés dans l’application. L’utilisation après information vaut acceptation.' }] },
    { h: '10. Droit applicable', items: [{ p: 'Droit français. En cas de litige, une solution amiable sera recherchée en priorité ; à défaut, les tribunaux compétents seront saisis. Les consommateurs peuvent recourir à un médiateur de la consommation : [coordonnées du médiateur, à compléter si l’offre devient payante].' }] },
  ],
};

export const LEGAL_PRIVACY = {
  title: 'Politique de confidentialité',
  updated: 'Dernière mise à jour : [date].',
  sections: [
    { h: '1. Qui est responsable de vos données ?', items: [{ ul: [
      '**Données de compte et de sécurité** (e-mail, mot de passe chiffré, connexions) : l’éditeur de YouPlaySport ([identité]) en est responsable de traitement.',
      '**Données liées à l’activité du club** (enfants, séances, présences, compétences, convocations) : le **club** décide des finalités et des moyens d’usage ; YouPlaySport agit pour son compte comme **sous-traitant technique** qui héberge et sécurise ces données. *[À faire valider par un juriste : répartition des rôles et éventuel accord de sous-traitance avec chaque club.]*',
    ] }] },
    { h: '2. Quelles données collectons-nous ?', items: [
      { ul: [
        '**Compte** : adresse e-mail, nom affiché, langue, mot de passe (stocké sous forme chiffrée par le service d’authentification, jamais lisible).',
        '**Rôles et clubs** : club(s) rejoint(s) et rôle (administrateur, coach, parent, athlète).',
        '**Enfants** (saisis par le parent ou le club) : prénom, nom, date de naissance, équipe, club.',
        '**Suivi sportif** : présences, compétences validées (« validée », « en progrès », « à travailler »), objectif et mot du coach, défi de la semaine, réponses aux convocations.',
        '**Consentement parental** : date et validation du consentement.',
        '**Support** : messages envoyés au support.',
        '**Données techniques** : journaux de connexion et d’erreur nécessaires au fonctionnement et à la sécurité.',
      ] },
      { p: 'Nous **ne collectons pas** : notes ou classements des enfants, données de santé, géolocalisation en continu, numéros de téléphone (ils ne sont jamais partagés entre familles).' },
    ] },
    { h: '3. Pourquoi, et sur quelle base légale ?', items: [{ table: [
      ['Finalité', 'Base légale'],
      ['Créer et sécuriser votre compte, vous connecter', 'Exécution du service demandé'],
      ['Permettre au club de suivre les séances, présences et compétences de ses licenciés', 'Intérêt légitime / mission du club ; **consentement du parent** pour les enfants mineurs'],
      ['Envoyer des e-mails de service (réinitialisation du mot de passe, invitations)', 'Exécution du service'],
      ['Assurer la sécurité, prévenir les abus, corriger les erreurs', 'Intérêt légitime'],
      ['Répondre à vos demandes de support', 'Exécution du service / intérêt légitime'],
    ] }] },
    { h: '4. Qui voit vos données ?', items: [
      { ul: [
        '**Parent** : voit uniquement ses propres enfants (dans tous les clubs où ils sont rattachés). **Aucun autre parent ne voit vos enfants.**',
        '**Coach** : voit uniquement les groupes qui lui sont assignés.',
        '**Administrateur de club** : voit les données de son club uniquement.',
        '**Un club ne voit jamais les autres clubs d’un même enfant.**',
        '**Athlète de 16 ans et plus** : voit son propre suivi.',
        '**L’éditeur** : accès restreint, protégé par double authentification, tracé dans un journal d’audit, uniquement pour l’exploitation, la sécurité et le support.',
      ] },
      { p: 'Nous ne vendons pas vos données et ne les utilisons pas à des fins publicitaires.' },
    ] },
    { h: '5. Nos prestataires (sous-traitants)', items: [
      { table: [
        ['Prestataire', 'Rôle', 'Localisation'],
        ['Supabase', 'Base de données et authentification', '**Paris, France**'],
        ['Vercel', 'Hébergement de l’application web ; les requêtes transitent par ses serveurs', 'Fonctions serveur à **Washington D.C., États-Unis** à la date de rédaction (migration vers Paris prévue [à confirmer]) ; société américaine'],
        ['Resend', 'Envoi des e-mails (réinitialisation de mot de passe, invitations)', 'États-Unis — [région à vérifier]'],
      ] },
      { p: 'Pour les prestataires situés hors de l’Union européenne ou traitant des données depuis les États-Unis, les transferts sont encadrés par les mécanismes prévus par le RGPD (clauses contractuelles types et/ou cadre d’adéquation applicable) : *[à vérifier et documenter pour chaque prestataire avant ouverture commerciale]*. Les données sont stockées en base à Paris ; les serveurs de l’application les traitent pour afficher les pages.' },
    ] },
    { h: '6. Combien de temps conservons-nous les données ?', items: [
      { note: '[Durées proposées, à valider]' },
      { ul: [
        '**Compte actif** : tant que le compte existe.',
        '**Après suppression du compte** : suppression immédiate du compte de connexion et de vos données personnelles ; les sauvegardes techniques sont purgées selon leur cycle [à préciser, ex. 30 jours].',
        '**Suivi sportif d’un enfant** : tant que l’enfant est rattaché au club ; suppression si le parent supprime son compte et qu’aucun autre parent actif n’est rattaché, ou sur demande du club.',
        '**Demandes de support** : [12 mois].',
        '**Journaux techniques** : [12 mois maximum].',
      ] },
    ] },
    { h: '7. Vos droits', items: [
      { p: 'Vous disposez des droits d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité. **Dans l’application** (Profil › Confidentialité) vous pouvez :' },
      { ul: [
        '**exporter vos données** (fichier JSON : compte, rôles, enfants et leur suivi, convocations, messages, notifications) ;',
        '**supprimer votre compte** : votre compte de connexion et vos données personnelles sont supprimés ; les enfants dont vous êtes le seul parent actif sont supprimés avec votre compte. Un administrateur unique d’un club encore actif doit d’abord transmettre l’administration.',
        '**retirer le consentement** pour un enfant en demandant son retrait au club ou à [contact].',
      ] },
      { p: '**Exercer vos droits (accès, rectification, export, suppression).** Votre club est responsable du traitement de vos données. Pour exercer vos droits, utilisez **Contacter mon club** sur la page Mon profil : le dirigeant de votre club peut consulter, corriger, exporter et supprimer vos données. Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL (cnil.fr).' },
      { p: 'Pour toute autre demande : [contact@youplaysport.app]. Réponse sous un mois. Vous pouvez aussi saisir la CNIL (cnil.fr) en cas de difficulté.' },
    ] },
    { h: '8. Cookies et traceurs', items: [{ p: 'L’application n’utilise que les cookies / stockages **strictement nécessaires** à la connexion et au fonctionnement (session d’authentification, préférence de langue, mise en cache de l’application installable). Nous n’utilisons **aucun traceur publicitaire**.' }] },
    { h: '9. Sécurité', items: [{ p: 'Connexions chiffrées, accès cloisonné par club et par relation parent-enfant au niveau de la base de données, accès des visiteurs non connectés limité au seul lien d’invitation, double authentification obligatoire pour l’administration de la plateforme, journal des actions sensibles, contrôle régulier des alertes de sécurité. Aucun système n’étant infaillible, en cas de violation de données susceptible d’engendrer un risque, nous préviendrons les personnes et l’autorité compétente dans les délais légaux.' }] },
    { h: '10. Enfants et mineurs', items: [{ p: 'Les données des enfants sont saisies par un parent ou tuteur légal (ou par le club avec l’accord de la famille). Un **consentement parental explicite** est demandé au rattachement d’un enfant. Aucun enfant ne peut créer seul un compte avant **16 ans**. L’application ne contient ni classement ni évaluation chiffrée des enfants.' }] },
    { h: '11. Contact', items: [{ p: '[Nom / entité], [adresse], [contact@youplaysport.app].' }] },
  ],
};
