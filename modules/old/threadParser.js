
var test = "Hi\n----Original Message----\nquoted message here";


/** general spacers for time and date */
var spacers = "[\\s,/\\.\\-]";

  /** matches times */
var timePattern  = "(?:[0-2])?[0-9]:[0-5][0-9](?::[0-5][0-9])?(?:(?:\\s)?[AP]M)?";

  /** matches day of the week */
var dayPattern   = "(?:(?:Mon(?:day)?)|(?:Tue(?:sday)?)|(?:Wed(?:nesday)?)|(?:Thu(?:rsday)?)|(?:Fri(?:day)?)|(?:Sat(?:urday)?)|(?:Sun(?:day)?))";

  /** matches day of the month (number and st, nd, rd, th) */
var dayOfMonthPattern = "[0-3]?[0-9]" + spacers + "*(?:(?:th)|(?:st)|(?:nd)|(?:rd))?";

  /** matches months (numeric and text) */
var monthPattern = "(?:(?:Jan(?:uary)?)|(?:Feb(?:uary)?)|(?:Mar(?:ch)?)|(?:Apr(?:il)?)|(?:May)|(?:Jun(?:e)?)|(?:Jul(?:y)?)" +
                                              "|(?:Aug(?:ust)?)|(?:Sep(?:tember)?)|(?:Oct(?:ober)?)|(?:Nov(?:ember)?)|(?:Dec(?:ember)?)|(?:[0-1]?[0-9]))";

  /** matches years (only 1000's and 2000's, because we are matching emails) */
var yearPattern  = "(?:[1-2]?[0-9])[0-9][0-9]";

  /** matches a full date */
var datePattern = "(?:" + dayPattern + spacers + "+)?(?:(?:" + dayOfMonthPattern + spacers + "+" + monthPattern + ")|" +
                                                "(?:" + monthPattern + spacers + "+" + dayOfMonthPattern + "))" +
                                                 spacers + "+" + yearPattern;

  /** matches a date and time combo (in either order) */
var dateTimePattern = "(?:" + datePattern + "[\\s,]*(?:(?:at)|(?:@))?\\s*" + timePattern + ")|" +
                                                "(?:" + timePattern + "[\\s,]*(?:on)?\\s*"+ datePattern + ")";

  /** matches a leading line such as
   * ----Original Message----
   * or simply
   * ------------------------
   */
var leadInLine = "-+\\s*(?:Original(?:\\sMessage)?)?\\s*-+\n";

  /** matches a header line indicating the date */
var dateLine = "(?:(?:date)|(?:sent)|(?:time)):\\s*"+ dateTimePattern + ".*\n";

  /** matches a subject or address line */
var subjectOrAddressLine = "((?:from)|(?:subject)|(?:b?cc)|(?:to))|:.*\n";

  /** matches gmail style quoted text beginning, i.e.
   * On Mon Jun 7, 2010 at 8:50 PM, Simon wrote:
   */
var gmailQuotedTextBeginning = "(On\\s+" + dateTimePattern + ".*wrote:\n)";


  /** matches the start of a quoted section of an email */
var QUOTED_TEXT_BEGINNING = new RegExp("(?:(?:" + leadInLine + ")?" +
  "(?:(?:" +subjectOrAddressLine + ")|(?:" + dateLine + ")){2,6})|(?:" +
  gmailQuotedTextBeginning + ")","i");

console.log(test.match(QUOTED_TEXT_BEGINNING));
